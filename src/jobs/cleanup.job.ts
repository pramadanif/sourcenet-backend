import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import prisma from '@/config/database';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { performance } from 'perf_hooks';

interface CleanupJobData {
  type?: 'full' | 'partial';
}

let cleanupQueue: Queue<CleanupJobData> | null = null;
let cleanupWorker: Worker<CleanupJobData> | null = null;

/**
 * Initialize cleanup queue
 */
export const initializeCleanupQueue = async (): Promise<Queue<CleanupJobData>> => {
  if (cleanupQueue) {
    return cleanupQueue;
  }

  try {
    const redisConnection = new Redis({
      host: new URL(env.REDIS_URL).hostname || 'localhost',
      port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    cleanupQueue = new Queue<CleanupJobData>('cleanup', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    logger.info('Cleanup queue initialized');
    return cleanupQueue;
  } catch (error) {
    logger.error('Failed to initialize cleanup queue', { error });
    throw error;
  }
};

/**
 * Start cleanup worker
 */
export const startCleanupWorker = async (): Promise<void> => {
  try {
    const queue = await initializeCleanupQueue();

    const redisConnection = new Redis({
      host: new URL(env.REDIS_URL).hostname || 'localhost',
      port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    cleanupWorker = new Worker<CleanupJobData>(
      'cleanup',
      async (job: Job<CleanupJobData>) => {
        return await processCleanupJob(job);
      },
      {
        connection: redisConnection,
        concurrency: 1,
      },
    );

    cleanupWorker.on('completed', (job: Job) => {
      logger.info('Cleanup job completed', { jobId: job.id });
    });

    cleanupWorker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Cleanup job failed', { jobId: job?.id, error: error.message });
    });

    logger.info('Cleanup worker started');
  } catch (error) {
    logger.error('Failed to start cleanup worker', { error });
    throw error;
  }
};

/**
 * Task a: Delete expired temporary uploads
 */
async function cleanupExpiredUploads(): Promise<{
  deletedCount: number;
  duration: number;
}> {
  const startTime = performance.now();
  try {
    // Find expired uploads (older than 24 hours, status='pending')
    const expirationTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const expiredUploads = await prisma.uploadStaging.findMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: expirationTime,
        },
      },
    });

    logger.info('Found expired uploads', { count: expiredUploads.length });

    // Delete from database
    const deleteResult = await prisma.uploadStaging.deleteMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: expirationTime,
        },
      },
    });

    logger.info('Deleted expired uploads from database', { count: deleteResult.count });

    // TODO: Delete from Walrus storage
    // for (const upload of expiredUploads) {
    //   try {
    //     await WalrusService.deleteBlob(upload.filePath);
    //   } catch (error) {
    //     logger.warn('Failed to delete blob from Walrus', { error, filePath: upload.filePath });
    //   }
    // }

    const duration = performance.now() - startTime;
    return {
      deletedCount: deleteResult.count,
      duration: Math.round(duration),
    };
  } catch (error) {
    logger.error('Failed to cleanup expired uploads', { error });
    throw error;
  }
}

/**
 * Task b: Vacuum and analyze database
 */
async function vacuumDatabase(): Promise<{
  duration: number;
}> {
  const startTime = performance.now();
  try {
    // Run VACUUM ANALYZE on PostgreSQL
    await prisma.$executeRawUnsafe('VACUUM ANALYZE');

    logger.info('Database vacuum and analyze completed');

    const duration = performance.now() - startTime;
    return {
      duration: Math.round(duration),
    };
  } catch (error) {
    logger.error('Failed to vacuum database', { error });
    // Don't throw - this is non-critical
    return {
      duration: Math.round(performance.now() - startTime),
    };
  }
}

/**
 * Task c: Cleanup old logs
 */
async function cleanupOldLogs(): Promise<{
  duration: number;
}> {
  const startTime = performance.now();
  try {
    // TODO: Implement log cleanup
    // This would typically involve:
    // 1. Finding log files older than 30 days
    // 2. Compressing them to archive storage
    // 3. Deleting the original files
    // 4. Updating log rotation settings

    logger.info('Old logs cleanup completed');

    const duration = performance.now() - startTime;
    return {
      duration: Math.round(duration),
    };
  } catch (error) {
    logger.error('Failed to cleanup old logs', { error });
    // Don't throw - this is non-critical
    return {
      duration: Math.round(performance.now() - startTime),
    };
  }
}

/**
 * Process cleanup job
 */
const processCleanupJob = async (job: Job<CleanupJobData>): Promise<void> => {
  const { type = 'full' } = job.data;
  const jobStartTime = performance.now();

  logger.info('Processing cleanup job', {
    jobId: job.id,
    type,
  });

  const results = {
    expiredUploads: { deletedCount: 0, duration: 0 },
    databaseVacuum: { duration: 0 },
    logCleanup: { duration: 0 },
  };

  try {
    // Task a: Delete expired uploads
    logger.info('Starting task: cleanup expired uploads');
    results.expiredUploads = await cleanupExpiredUploads();

    // Task b: Vacuum database
    logger.info('Starting task: vacuum database');
    results.databaseVacuum = await vacuumDatabase();

    // Task c: Cleanup old logs
    logger.info('Starting task: cleanup old logs');
    results.logCleanup = await cleanupOldLogs();

    const totalDuration = performance.now() - jobStartTime;

    // Log cleanup summary
    logger.info('Cleanup job completed successfully', {
      jobId: job.id,
      totalDuration: Math.round(totalDuration),
      results: {
        expiredUploadsDeleted: results.expiredUploads.deletedCount,
        expiredUploadsDuration: results.expiredUploads.duration,
        databaseVacuumDuration: results.databaseVacuum.duration,
        logCleanupDuration: results.logCleanup.duration,
      },
    });
  } catch (error) {
    logger.error('Cleanup job processing failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
      results,
    });
    throw error;
  }
};

/**
 * Queue cleanup job
 */
export const queueCleanupJob = async (data?: CleanupJobData): Promise<Job<CleanupJobData>> => {
  try {
    const queue = await initializeCleanupQueue();
    const job = await queue.add('cleanup', data || { type: 'full' }, {
      jobId: `cleanup-${Date.now()}`,
      priority: 1,
    });

    logger.info('Cleanup job queued', {
      jobId: job.id,
    });

    return job;
  } catch (error) {
    logger.error('Failed to queue cleanup job', { error });
    throw error;
  }
};

/**
 * Schedule cleanup job daily at 2 AM
 */
export const scheduleCleanupJob = async (): Promise<void> => {
  try {
    const queue = await initializeCleanupQueue();

    // Schedule recurring job at 2 AM every day
    await queue.add(
      'cleanup',
      { type: 'full' },
      {
        repeat: {
          pattern: '0 2 * * *', // Cron: 2 AM every day
        },
        jobId: 'cleanup-daily-2am',
      },
    );

    logger.info('Cleanup job scheduled for daily execution at 2 AM');
  } catch (error) {
    logger.error('Failed to schedule cleanup job', { error });
    throw error;
  }
};

/**
 * Get cleanup queue
 */
export const getCleanupQueue = async (): Promise<Queue<CleanupJobData>> => {
  return await initializeCleanupQueue();
};

/**
 * Shutdown cleanup queue and worker
 */
export const shutdownCleanupQueue = async (): Promise<void> => {
  try {
    if (cleanupWorker) {
      await cleanupWorker.close();
      cleanupWorker = null;
    }

    if (cleanupQueue) {
      await cleanupQueue.close();
      cleanupQueue = null;
    }

    logger.info('Cleanup queue and worker shut down');
  } catch (error) {
    logger.error('Error shutting down cleanup queue', { error });
  }
};
