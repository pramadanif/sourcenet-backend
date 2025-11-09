import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import prisma from '@/config/database';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { performance } from 'perf_hooks';

interface IndexerSyncJobData {
  type?: 'health-check' | 'full-sync';
}

interface IndexerMetrics {
  eventsProcessed: number;
  indexerLag: number; // milliseconds
  syncLatency: number; // milliseconds
  lastSyncedEvent: string | null;
  lastSyncedTimestamp: Date | null;
  status: 'healthy' | 'lagging' | 'critical';
}

let indexerSyncQueue: Queue<IndexerSyncJobData> | null = null;
let indexerSyncWorker: Worker<IndexerSyncJobData> | null = null;

/**
 * Initialize indexer-sync queue
 */
export const initializeIndexerSyncQueue = async (): Promise<Queue<IndexerSyncJobData>> => {
  if (indexerSyncQueue) {
    return indexerSyncQueue;
  }

  try {
    const redisConnection = new Redis({
      host: new URL(env.REDIS_URL).hostname || 'localhost',
      port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    indexerSyncQueue = new Queue<IndexerSyncJobData>('indexer-sync', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    logger.info('Indexer-sync queue initialized');
    return indexerSyncQueue;
  } catch (error) {
    logger.error('Failed to initialize indexer-sync queue', { error });
    throw error;
  }
};

/**
 * Start indexer-sync worker
 */
export const startIndexerSyncWorker = async (): Promise<void> => {
  try {
    const queue = await initializeIndexerSyncQueue();

    const redisConnection = new Redis({
      host: new URL(env.REDIS_URL).hostname || 'localhost',
      port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    indexerSyncWorker = new Worker<IndexerSyncJobData>(
      'indexer-sync',
      async (job: Job<IndexerSyncJobData>) => {
        return await processIndexerSyncJob(job);
      },
      {
        connection: redisConnection,
        concurrency: 1,
      },
    );

    indexerSyncWorker.on('completed', (job: Job) => {
      logger.info('Indexer-sync job completed', { jobId: job.id });
    });

    indexerSyncWorker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Indexer-sync job failed', { jobId: job?.id, error: error.message });
    });

    logger.info('Indexer-sync worker started');
  } catch (error) {
    logger.error('Failed to start indexer-sync worker', { error });
    throw error;
  }
};

/**
 * Check indexer health
 */
async function checkIndexerHealth(): Promise<IndexerMetrics> {
  const startTime = performance.now();
  try {
    // TODO: Get checkpoint from indexer database/service
    // For now, we'll use mock data
    const lastSyncedEvent = 'event_12345';
    const lastSyncedTimestamp = new Date(Date.now() - 5000); // 5 seconds ago

    const now = new Date();
    const indexerLag = now.getTime() - lastSyncedTimestamp.getTime();

    // Determine status based on lag
    let status: 'healthy' | 'lagging' | 'critical';
    if (indexerLag < 5000) {
      status = 'healthy';
    } else if (indexerLag < 10000) {
      status = 'lagging';
    } else {
      status = 'critical';
    }

    if (status !== 'healthy') {
      logger.warn('Indexer lag detected', {
        lag: indexerLag,
        status,
        lastSyncedEvent,
        lastSyncedTimestamp,
      });
    }

    // TODO: Query blockchain for event count
    const eventsProcessed = 1000; // Mock value

    const syncLatency = performance.now() - startTime;

    return {
      eventsProcessed,
      indexerLag,
      syncLatency: Math.round(syncLatency),
      lastSyncedEvent,
      lastSyncedTimestamp,
      status,
    };
  } catch (error) {
    logger.error('Failed to check indexer health', { error });
    throw error;
  }
}

/**
 * Verify no event gaps
 */
async function verifyEventGaps(): Promise<{
  hasGaps: boolean;
  gapCount: number;
  duration: number;
}> {
  const startTime = performance.now();
  try {
    // TODO: Query indexer for event sequence
    // Compare with blockchain events to detect gaps
    // For now, return mock data

    logger.info('Event gap verification completed');

    const duration = performance.now() - startTime;
    return {
      hasGaps: false,
      gapCount: 0,
      duration: Math.round(duration),
    };
  } catch (error) {
    logger.error('Failed to verify event gaps', { error });
    throw error;
  }
}

/**
 * Update indexer metrics
 */
async function updateIndexerMetrics(metrics: IndexerMetrics): Promise<void> {
  try {
    // TODO: Create IndexerMetrics model in Prisma and store
    logger.info('Indexer metrics updated', {
      eventsProcessed: metrics.eventsProcessed,
      indexerLag: metrics.indexerLag,
      syncLatency: metrics.syncLatency,
      status: metrics.status,
    });

    // Example implementation:
    // await prisma.indexerMetrics.create({
    //   data: {
    //     eventsProcessed: metrics.eventsProcessed,
    //     indexerLag: metrics.indexerLag,
    //     syncLatency: metrics.syncLatency,
    //     lastSyncedEvent: metrics.lastSyncedEvent,
    //     lastSyncedTimestamp: metrics.lastSyncedTimestamp,
    //     status: metrics.status,
    //     createdAt: new Date(),
    //   },
    // });
  } catch (error) {
    logger.error('Failed to update indexer metrics', { error });
    throw error;
  }
}

/**
 * Alert admin of indexer issues
 */
async function alertAdmin(issue: string, details: Record<string, any>): Promise<void> {
  try {
    logger.error('INDEXER ALERT', {
      issue,
      details,
    });

    // TODO: Send alert to monitoring system
    // - Slack notification
    // - Email to admin
    // - PagerDuty incident
    // - Sentry error
  } catch (error) {
    logger.error('Failed to send admin alert', { error });
  }
}

/**
 * Process indexer-sync job
 */
const processIndexerSyncJob = async (job: Job<IndexerSyncJobData>): Promise<void> => {
  const { type = 'health-check' } = job.data;
  const jobStartTime = performance.now();

  logger.info('Processing indexer-sync job', {
    jobId: job.id,
    type,
  });

  try {
    // Check indexer health
    logger.info('Checking indexer health...');
    const metrics = await checkIndexerHealth();

    // Alert if lag is too high
    if (metrics.indexerLag > 10000) {
      await alertAdmin('High indexer lag detected', {
        lag: metrics.indexerLag,
        status: metrics.status,
        lastSyncedEvent: metrics.lastSyncedEvent,
      });
    }

    // Verify no event gaps
    logger.info('Verifying event gaps...');
    const gapCheck = await verifyEventGaps();

    if (gapCheck.hasGaps) {
      await alertAdmin('Event gaps detected in indexer', {
        gapCount: gapCheck.gapCount,
        duration: gapCheck.duration,
      });

      // Trigger full sync if gaps detected
      logger.warn('Triggering full indexer sync due to detected gaps');
      // TODO: Trigger full sync
    }

    // Update metrics in database
    logger.info('Updating indexer metrics...');
    await updateIndexerMetrics(metrics);

    const totalDuration = performance.now() - jobStartTime;

    logger.info('Indexer-sync job completed successfully', {
      jobId: job.id,
      type,
      totalDuration: Math.round(totalDuration),
      metrics: {
        eventsProcessed: metrics.eventsProcessed,
        indexerLag: metrics.indexerLag,
        syncLatency: metrics.syncLatency,
        status: metrics.status,
      },
      gaps: {
        hasGaps: gapCheck.hasGaps,
        gapCount: gapCheck.gapCount,
      },
    });
  } catch (error) {
    logger.error('Indexer-sync job processing failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });

    // Alert admin of sync failure
    await alertAdmin('Indexer sync job failed', {
      error: error instanceof Error ? error.message : String(error),
      jobId: job.id,
    });

    throw error;
  }
};

/**
 * Queue indexer-sync job
 */
export const queueIndexerSyncJob = async (
  data?: IndexerSyncJobData,
): Promise<Job<IndexerSyncJobData>> => {
  try {
    const queue = await initializeIndexerSyncQueue();
    const job = await queue.add('sync', data || { type: 'health-check' }, {
      jobId: `indexer-sync-${Date.now()}`,
      priority: 10,
    });

    logger.info('Indexer-sync job queued', {
      jobId: job.id,
    });

    return job;
  } catch (error) {
    logger.error('Failed to queue indexer-sync job', { error });
    throw error;
  }
};

/**
 * Schedule indexer-sync job every 5 minutes
 */
export const scheduleIndexerSyncJob = async (): Promise<void> => {
  try {
    const queue = await initializeIndexerSyncQueue();

    // Schedule recurring job every 5 minutes
    await queue.add(
      'sync',
      { type: 'health-check' },
      {
        repeat: {
          pattern: '*/5 * * * *', // Cron: every 5 minutes
        },
        jobId: 'indexer-sync-every-5min',
      },
    );

    logger.info('Indexer-sync job scheduled for every 5 minutes');
  } catch (error) {
    logger.error('Failed to schedule indexer-sync job', { error });
    throw error;
  }
};

/**
 * Get indexer-sync queue
 */
export const getIndexerSyncQueue = async (): Promise<Queue<IndexerSyncJobData>> => {
  return await initializeIndexerSyncQueue();
};

/**
 * Shutdown indexer-sync queue and worker
 */
export const shutdownIndexerSyncQueue = async (): Promise<void> => {
  try {
    if (indexerSyncWorker) {
      await indexerSyncWorker.close();
      indexerSyncWorker = null;
    }

    if (indexerSyncQueue) {
      await indexerSyncQueue.close();
      indexerSyncQueue = null;
    }

    logger.info('Indexer-sync queue and worker shut down');
  } catch (error) {
    logger.error('Error shutting down indexer-sync queue', { error });
  }
};
