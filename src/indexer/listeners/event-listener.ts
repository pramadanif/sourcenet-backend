import { SuiClient } from '@mysten/sui/client';
import { EventEmitter } from 'eventemitter3';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';
import { BlockchainService } from '@/services/blockchain.service';
import { CheckpointManager } from './checkpoint.manager';
import { ErrorRecovery, ErrorClassifier } from './error-recovery';

const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds
const EVENT_BATCH_SIZE = 100;

export interface ParsedEvent {
  type: string;
  eventId: string;
  timestamp: number;
  blockHeight: number;
  data: any;
}

export interface EventListenerConfig {
  pollIntervalMs?: number;
  batchSize?: number;
  maxRetries?: number;
}

/**
 * Blockchain event listener
 * Polls Sui blockchain for events and emits them for processing
 */
export class EventListener extends EventEmitter {
  private client: SuiClient;
  private prisma: PrismaClient;
  private checkpointManager: CheckpointManager;
  private errorRecovery: ErrorRecovery;
  private isRunning: boolean = false;
  private pollIntervalMs: number;
  private batchSize: number;
  private pollTimer: NodeJS.Timeout | null = null;

  // Event type mappings
  private eventTypeMap = {
    'sourcenet::datapod::DataPodPublished': 'datapod.published',
    'sourcenet::purchase::PurchaseRequestCreated': 'purchase.created',
    'sourcenet::purchase::PurchaseCompleted': 'purchase.completed',
    'sourcenet::escrow::PaymentReleased': 'payment.released',
    'sourcenet::datapod::ReviewAdded': 'review.added',
    'sourcenet::datapod::DataPodDelisted': 'datapod.delisted',
  };

  constructor(prisma: PrismaClient, config: EventListenerConfig = {}) {
    super();
    this.client = BlockchainService.getClient();
    this.prisma = prisma;
    this.checkpointManager = new CheckpointManager(prisma);
    this.errorRecovery = new ErrorRecovery({
      maxRetries: config.maxRetries || 5,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
    });
    this.pollIntervalMs = config.pollIntervalMs || POLL_INTERVAL_MS;
    this.batchSize = config.batchSize || EVENT_BATCH_SIZE;
  }

  /**
   * Start listening for events
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Event listener already running');
      return;
    }

    this.isRunning = true;
    logger.info('Event listener starting', {
      pollIntervalMs: this.pollIntervalMs,
      batchSize: this.batchSize,
    });

    // Start polling loop
    this.poll();
  }

  /**
   * Stop listening for events
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    logger.info('Event listener stopped');
  }

  /**
   * Main polling loop
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.pollOnce();
    } catch (error) {
      logger.error('Error in polling loop', { error });
    } finally {
      // Schedule next poll
      this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }

  /**
   * Single poll iteration
   */
  private async pollOnce(): Promise<void> {
    const checkpoint = await this.checkpointManager.loadCheckpoint();

    // Query events from blockchain
    const events = await this.errorRecovery.executeWithRetry(
      () =>
        this.client.queryEvents({
          query: {
            MoveEventType: Object.keys(this.eventTypeMap) as any,
          },
          order: 'ascending',
          limit: this.batchSize,
          cursor: checkpoint.lastEventId as any || undefined,
        }),
      'queryEvents',
    );

    if (!events.data || events.data.length === 0) {
      logger.debug('No new events', { checkpoint: checkpoint.lastEventId });
      return;
    }

    logger.info('📡 Fetched events from blockchain', { 
      count: events.data.length,
      checkpoint: checkpoint.lastEventId,
      timestamp: new Date().toISOString(),
    });

    // Process each event
    for (const event of events.data) {
      try {
        // Check for chain reorganization
        const eventBlockHeight = parseInt(event.id.txDigest.slice(0, 8), 16);
        const isReorg = await this.checkpointManager.handleReorg(
          event.id.eventSeq,
          eventBlockHeight,
        );

        if (isReorg) {
          logger.warn('Skipping event due to reorg', { eventId: event.id.eventSeq });
          continue;
        }

        // Parse event
        const parsedEvent = this.parseEvent(event);
        if (!parsedEvent) {
          logger.debug('Skipped unknown event type', { eventType: event.type });
          continue;
        }

        // Log parsed event
        logger.info('✅ Event parsed', {
          type: parsedEvent.type,
          eventId: parsedEvent.eventId,
          blockHeight: parsedEvent.blockHeight,
          timestamp: new Date(parsedEvent.timestamp).toISOString(),
        });

        // Emit parsed event
        this.emit('event', parsedEvent);

        // Update checkpoint
        await this.checkpointManager.updateCheckpoint(
          event.id.eventSeq as any,
          Date.now(),
          eventBlockHeight,
        );
      } catch (error) {
        const severity = ErrorClassifier.getSeverity(error);
        if (severity === 'critical') {
          logger.error('Critical error processing event, stopping listener', { error });
          await this.stop();
          throw error;
        } else {
          logger.warn('Error processing event, continuing', { error, eventId: event.id });
        }
      }
    }

    // Emit batch complete event
    logger.info('🔄 Batch processing complete', {
      eventsProcessed: events.data.length,
      timestamp: new Date().toISOString(),
      nextCheckpoint: events.data[events.data.length - 1]?.id?.eventSeq,
    });
    this.emit('batch-complete', {
      count: events.data.length,
      timestamp: Date.now(),
    });
  }

  /**
   * Parse blockchain event
   */
  private parseEvent(event: any): ParsedEvent | null {
    const eventType = this.eventTypeMap[event.type as keyof typeof this.eventTypeMap];
    if (!eventType) {
      return null;
    }

    try {
      const blockHeight = parseInt(event.id.txDigest.slice(0, 8), 16);

      logger.debug('Parsing event', {
        rawType: event.type,
        mappedType: eventType,
        eventSeq: event.id.eventSeq,
      });

      return {
        type: eventType,
        eventId: event.id.eventSeq,
        timestamp: event.timestampMs || Date.now(),
        blockHeight,
        data: event.parsedJson || event.bcs,
      };
    } catch (error) {
      logger.error('Failed to parse event', { error, eventType: event.type });
      return null;
    }
  }

  /**
   * Get current processing lag
   */
  async getProcessingLag(): Promise<number> {
    return this.checkpointManager.getProcessingLag();
  }

  /**
   * Get listener status
   */
  getStatus(): {
    isRunning: boolean;
    pollIntervalMs: number;
    batchSize: number;
  } {
    return {
      isRunning: this.isRunning,
      pollIntervalMs: this.pollIntervalMs,
      batchSize: this.batchSize,
    };
  }
}
