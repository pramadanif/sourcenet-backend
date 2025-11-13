import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'eventemitter3';
import { logger } from '@/utils/logger';
import { ParsedEvent } from '@/indexer/listeners/event-listener';
import { parseDataPodPublished } from '@/indexer/parsers/datapod-parser';
import { parsePurchaseRequestCreated, parsePurchaseCompleted } from '@/indexer/parsers/purchase-parser';
import { parsePaymentReleased } from '@/indexer/parsers/payment-parser';
import { parseReviewAdded } from '@/indexer/parsers/review-parser';
import { parseDataPodDelisted } from '@/indexer/parsers/delisting-parser';
import { transformDataPodPublished, transformDataPodDelisted } from '@/indexer/transformers/datapod-transformer';
import { transformPurchaseRequestCreated, transformPurchaseCompleted } from '@/indexer/transformers/purchase-transformer';
import { aggregateSellerStats } from '@/indexer/transformers/stats-transformer';

const BATCH_SIZE = 100;
const BATCH_TIMEOUT_MS = 3000;

export interface BatchWriterConfig {
  batchSize?: number;
  batchTimeoutMs?: number;
}

/**
 * Batch writer for atomic database writes
 * Collects events and writes them in transactions
 */
export class BatchWriter extends EventEmitter {
  private prisma: PrismaClient;
  private eventQueue: ParsedEvent[] = [];
  private batchSize: number;
  private batchTimeoutMs: number;
  private batchTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  constructor(prisma: PrismaClient, config: BatchWriterConfig = {}) {
    super();
    this.prisma = prisma;
    this.batchSize = config.batchSize || BATCH_SIZE;
    this.batchTimeoutMs = config.batchTimeoutMs || BATCH_TIMEOUT_MS;
  }

  /**
   * Add event to batch queue
   */
  async addEvent(event: ParsedEvent): Promise<void> {
    this.eventQueue.push(event);
    logger.debug('Event added to batch queue', {
      eventType: event.type,
      queueSize: this.eventQueue.length,
      batchSize: this.batchSize,
    });

    // Check if batch is full
    if (this.eventQueue.length >= this.batchSize) {
      logger.info('📦 Batch full, flushing to database', { queueSize: this.eventQueue.length });
      await this.flush();
    } else if (!this.batchTimer) {
      // Start batch timeout
      this.batchTimer = setTimeout(() => this.flush(), this.batchTimeoutMs);
    }
  }

  /**
   * Flush batch to database
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    if (this.isProcessing) {
      logger.debug('Batch already processing, skipping flush');
      return;
    }

    // Clear batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.isProcessing = true;
    const batch = [...this.eventQueue];
    this.eventQueue = [];

    try {
      const startTime = Date.now();
      logger.info('💾 Writing batch to database', { count: batch.length });
      await this.writeBatch(batch);
      const duration = Date.now() - startTime;

      logger.info('✅ Batch written successfully', {
        count: batch.length,
        durationMs: duration,
        eventsPerSecond: Math.round((batch.length / duration) * 1000),
      });

      this.emit('batch-written', {
        count: batch.length,
        durationMs: duration,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('❌ Failed to write batch', { 
        error: error instanceof Error ? error.message : error,
        count: batch.length,
        requeueing: true,
      });
      // Re-queue events for retry
      this.eventQueue.unshift(...batch);
      this.emit('batch-error', { error, count: batch.length });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Write batch in a single transaction
   */
  private async writeBatch(events: ParsedEvent[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const event of events) {
        await this.processEvent(tx, event);
      }
    });
  }

  /**
   * Process individual event
   */
  private async processEvent(tx: any, event: ParsedEvent): Promise<void> {
    try {
      logger.debug('Processing event in transaction', {
        type: event.type,
        eventId: event.eventId,
      });
      switch (event.type) {
        case 'datapod.published': {
          const parsed = parseDataPodPublished(event.data);
          if (!parsed) return;
          const transformed = transformDataPodPublished(parsed);
          if (!transformed) return;

          await tx.dataPod.upsert({
            where: { datapodId: transformed.datapod_id },
            update: {
              title: transformed.title,
              category: transformed.category,
              priceSui: transformed.price_sui,
              status: transformed.status,
              publishedAt: transformed.published_at,
            },
            create: {
              datapodId: transformed.datapod_id,
              sellerId: 'placeholder', // Will be resolved from seller_address
              title: transformed.title,
              category: transformed.category,
              priceSui: transformed.price_sui,
              dataHash: parsed.data_hash,
              status: transformed.status,
              publishedAt: transformed.published_at,
            },
          });
          break;
        }

        case 'datapod.delisted': {
          const parsed = parseDataPodDelisted(event.data);
          if (!parsed) return;
          const transformed = transformDataPodDelisted(parsed);
          if (!transformed) return;

          await tx.dataPod.update({
            where: { datapodId: transformed.datapod_id },
            data: { status: transformed.status },
          });
          break;
        }

        case 'purchase.created': {
          const parsed = parsePurchaseRequestCreated(event.data);
          if (!parsed) return;
          const transformed = transformPurchaseRequestCreated(parsed);
          if (!transformed) return;

          await tx.purchaseRequest.upsert({
            where: { purchaseRequestId: transformed.purchase_request_id },
            update: {
              status: transformed.status,
            },
            create: {
              purchaseRequestId: transformed.purchase_request_id,
              datapodId: 'placeholder', // Will be resolved from datapod_id
              buyerId: 'placeholder', // Will be resolved from buyer_address
              buyerAddress: transformed.buyer_address,
              sellerAddress: transformed.seller_address,
              buyerPublicKey: '', // Will be fetched from DB
              priceSui: transformed.price_sui,
              status: transformed.status,
            },
          });
          break;
        }

        case 'purchase.completed': {
          const parsed = parsePurchaseCompleted(event.data);
          if (!parsed) return;
          const transformed = transformPurchaseCompleted(parsed);
          if (!transformed) return;

          await tx.purchaseRequest.update({
            where: { purchaseRequestId: transformed.purchase_request_id },
            data: {
              status: transformed.status,
              encryptedBlobId: transformed.encrypted_blob_id,
              completedAt: new Date(),
            },
          });
          break;
        }

        case 'payment.released': {
          const parsed = parsePaymentReleased(event.data);
          if (!parsed) return;

          if (parsed.purchase_id) {
            await tx.escrowTransaction.update({
              where: { purchaseRequestId: parsed.purchase_id },
              data: {
                status: 'released',
                releasedAt: new Date(),
              },
            });
          }
          break;
        }

        case 'review.added': {
          const parsed = parseReviewAdded(event.data);
          if (!parsed) return;

          // Create or update review
          await tx.review.upsert({
            where: {
              datapodId_buyerId: {
                datapodId: 'placeholder', // Will be resolved
                buyerId: 'placeholder', // Will be resolved
              },
            },
            update: {
              rating: parsed.rating,
              comment: parsed.comment,
            },
            create: {
              datapodId: 'placeholder',
              purchaseRequestId: 'placeholder',
              buyerId: 'placeholder',
              buyerAddress: parsed.buyer_address,
              rating: parsed.rating,
              comment: parsed.comment,
            },
          });
          break;
        }

        default:
          logger.warn('⚠️ Unknown event type', { type: event.type });
      }
      logger.debug('Event processed successfully', {
        type: event.type,
        eventId: event.eventId,
      });
    } catch (error) {
      logger.error('❌ Error processing event', { 
        error: error instanceof Error ? error.message : error,
        eventType: event.type,
        eventId: event.eventId,
      });
      throw error; // Re-throw to rollback transaction
    }
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.eventQueue.length;
  }

  /**
   * Get writer status
   */
  getStatus(): {
    queueSize: number;
    isProcessing: boolean;
    batchSize: number;
  } {
    return {
      queueSize: this.eventQueue.length,
      isProcessing: this.isProcessing,
      batchSize: this.batchSize,
    };
  }
}
