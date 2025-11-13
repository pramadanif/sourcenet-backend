import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { logger } from '@/utils/logger';
import { EventListener } from './listeners/event-listener';
import { BatchWriter } from './writers/batch-writer';
import { WebSocketBroadcaster } from '@/websocket/websocket.broadcaster';
import { HealthCheckMonitor } from './monitoring/health-check';
import { MetricsCollector } from './monitoring/metrics';
import { AlertManager } from './monitoring/alerts';

export interface IndexerConfig {
  pollIntervalMs?: number;
  batchSize?: number;
  healthCheckIntervalMs?: number;
  metricsExportIntervalMs?: number;
}

/**
 * Main indexer orchestrator
 * Coordinates event listener, batch writer, broadcaster, and monitoring
 */
export class Indexer {
  private prisma: PrismaClient;
  private redis: Redis;
  private eventListener: EventListener;
  private batchWriter: BatchWriter;
  private broadcaster: WebSocketBroadcaster;
  private healthMonitor: HealthCheckMonitor;
  private metricsCollector: MetricsCollector;
  private alertManager: AlertManager;
  private isRunning: boolean = false;
  private config: IndexerConfig;

  constructor(
    prisma: PrismaClient,
    redis: Redis,
    broadcaster: WebSocketBroadcaster,
    config: IndexerConfig = {},
  ) {
    this.prisma = prisma;
    this.redis = redis;
    this.broadcaster = broadcaster;
    this.config = config;

    // Initialize components
    this.eventListener = new EventListener(prisma, {
      pollIntervalMs: config.pollIntervalMs || 3000,
      batchSize: config.batchSize || 100,
    });

    this.batchWriter = new BatchWriter(prisma, {
      batchSize: config.batchSize || 100,
      batchTimeoutMs: 3000,
    });

    this.healthMonitor = new HealthCheckMonitor(prisma, redis);
    this.metricsCollector = new MetricsCollector();
    this.alertManager = new AlertManager({
      enableSlack: true,
      enableEmail: false,
    });

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers between components
   */
  private setupEventHandlers(): void {
    // Event listener -> batch writer
    this.eventListener.on('event', async (event) => {
      try {
        await this.batchWriter.addEvent(event);
        this.metricsCollector.incrementEventsProcessed();
      } catch (error) {
        logger.error('Error adding event to batch writer', { error });
        this.metricsCollector.incrementErrors();
      }
    });

    // Batch writer -> broadcaster
    this.batchWriter.on('batch-written', async (batch) => {
      this.metricsCollector.recordBatchSize(batch.count);
      this.metricsCollector.recordDatabaseLatency(batch.durationMs);
    });

    this.batchWriter.on('batch-error', async (error) => {
      this.metricsCollector.incrementErrors();
      const alert = this.alertManager.createErrorRateAlert(0.01, 0.005);
      await this.alertManager.sendAlert(alert);
    });

    // Event listener -> broadcaster
    this.eventListener.on('batch-complete', async (batch) => {
      try {
        // Broadcast events to connected clients
        const lag = await this.eventListener.getProcessingLag();
        this.metricsCollector.updateIndexerLag(lag);
      } catch (error) {
        logger.error('Error updating lag metrics', { error });
      }
    });
  }

  /**
   * Start the indexer
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Indexer already running');
      return;
    }

    try {
      logger.info('Starting indexer');

      // Start health checks
      this.healthMonitor.startPeriodicChecks(this.config.healthCheckIntervalMs || 30000);

      // Start event listener
      await this.eventListener.start();

      // Start metrics export
      this.startMetricsExport(this.config.metricsExportIntervalMs || 60000);

      this.isRunning = true;
      logger.info('Indexer started successfully');
    } catch (error) {
      logger.error('Failed to start indexer', { error });
      throw error;
    }
  }

  /**
   * Stop the indexer
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Indexer not running');
      return;
    }

    try {
      logger.info('Stopping indexer');

      // Flush any pending batches
      await this.batchWriter.flush();

      // Stop event listener
      await this.eventListener.stop();

      // Stop health checks
      this.healthMonitor.stopPeriodicChecks();

      this.isRunning = false;
      logger.info('Indexer stopped successfully');
    } catch (error) {
      logger.error('Error stopping indexer', { error });
      throw error;
    }
  }

  /**
   * Start metrics export
   */
  // Di startMetricsExport method, ganti setInterval dengan:

private startMetricsExport(intervalMs: number): void {
  const startTime = Date.now();
  let lastEventCount = 0;

  // Realtime logger - update setiap detik
  setInterval(() => {
    const metrics = this.metricsCollector.getMetrics();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID');
    
    // Hitung EPS (Events Per Second)
    const eps = metrics.eventsProcessedTotal - lastEventCount;
    lastEventCount = metrics.eventsProcessedTotal;
    
    // Status indicator
    const healthIcon = metrics.indexerErrorsTotal === 0 ? '✅' : '❌';
    
    // Display realtime
    process.stdout.write('\r');
    process.stdout.write(
      `${healthIcon} ${timeStr} | ⬆️  ${uptime}s | ` +
      `📊 ${metrics.eventsProcessedTotal} events | ` +
      `⚡ ${eps}/s | ` +
      `📦 ${metrics.batchSizeAvg.toFixed(1)} avg batch | ` +
      `❌ ${metrics.indexerErrorsTotal} errors | ` +
      `🔄 ${metrics.indexerLagSeconds}s lag | ` +
      `⏱️  ${metrics.databaseWriteLatencyMs.length > 0 ? (metrics.databaseWriteLatencyMs.reduce((a, b) => a + b, 0) / metrics.databaseWriteLatencyMs.length).toFixed(0) : 0}ms db`
    );
  }, 1000);

  // Metrics export - setiap intervalMs
  setInterval(async () => {
    try {
      const health = await this.healthMonitor.performHealthCheck();

      // Check for alerts
      if (health.status !== 'healthy') {
        if (health.checks.processingLag.status === 'error') {
          const lag = health.checks.processingLag.details?.lagSeconds || 0;
          const alert = this.alertManager.createLagAlert(lag, 30);
          await this.alertManager.sendAlert(alert);
        }

        if (health.checks.database.status === 'error') {
          const alert = this.alertManager.createDatabaseLatencyAlert(
            health.metrics.databaseLatencyMs,
            5000,
          );
          await this.alertManager.sendAlert(alert);
        }
      }

      logger.debug('Metrics exported', {
        status: health.status,
        eventsProcessed: this.metricsCollector.getMetrics().eventsProcessedTotal,
      });
    } catch (error) {
      logger.error('Error exporting metrics', { error });
    }
  }, intervalMs);
}

  /**
   * Get indexer status
   */
  getStatus(): {
    isRunning: boolean;
    listener: any;
    writer: any;
    broadcaster: any;
    metrics: any;
    health: any;
  } {
    return {
      isRunning: this.isRunning,
      listener: this.eventListener.getStatus(),
      writer: this.batchWriter.getStatus(),
      broadcaster: this.broadcaster.getStatus(),
      metrics: this.metricsCollector.getMetrics(),
      health: this.healthMonitor.getLastStatus(),
    };
  }

  /**
   * Get metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    return this.metricsCollector.exportPrometheus();
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics(): any {
    return this.alertManager.getStatistics();
  }
}
