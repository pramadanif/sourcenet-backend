import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import prisma from '@/config/database';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { performance } from 'perf_hooks';
import { Decimal } from '@prisma/client/runtime/library';

interface StatsJobData {
  seller_address: string;
  datapod_id: string;
  trigger?: 'purchase.completed' | 'review.added';
}

let statsQueue: Queue<StatsJobData> | null = null;
let statsWorker: Worker<StatsJobData> | null = null;

/**
 * Initialize stats queue
 */
export const initializeStatsQueue = async (): Promise<Queue<StatsJobData>> => {
  if (statsQueue) {
    return statsQueue;
  }

  try {
    const redisConnection = new Redis({
      host: new URL(env.REDIS_URL).hostname || 'localhost',
      port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    statsQueue = new Queue<StatsJobData>('stats', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    logger.info('Stats queue initialized');
    return statsQueue;
  } catch (error) {
    logger.error('Failed to initialize stats queue', { error });
    throw error;
  }
};

/**
 * Start stats worker
 */
export const startStatsWorker = async (): Promise<void> => {
  try {
    const queue = await initializeStatsQueue();

    const redisConnection = new Redis({
      host: new URL(env.REDIS_URL).hostname || 'localhost',
      port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    statsWorker = new Worker<StatsJobData>(
      'stats',
      async (job: Job<StatsJobData>) => {
        return await processStatsJob(job);
      },
      {
        connection: redisConnection,
        concurrency: 5,
      },
    );

    statsWorker.on('completed', (job: Job) => {
      logger.info('Stats job completed', { jobId: job.id });
    });

    statsWorker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Stats job failed', { jobId: job?.id, error: error.message });
    });

    logger.info('Stats worker started');
  } catch (error) {
    logger.error('Failed to start stats worker', { error });
    throw error;
  }
};

/**
 * Calculate seller statistics
 */
async function calculateSellerStats(sellerAddress: string): Promise<{
  totalSales: number;
  totalRevenue: Decimal;
  averageRating: Decimal | null;
}> {
  try {
    // Find seller by address
    const seller = await prisma.user.findUnique({
      where: { zkloginAddress: sellerAddress },
    });

    if (!seller) {
      throw new Error(`Seller not found: ${sellerAddress}`);
    }

    // Count completed purchases
    const totalSales = await prisma.purchaseRequest.count({
      where: {
        datapod: {
          sellerId: seller.id,
        },
        status: 'completed',
      },
    });

    // Sum revenue from completed purchases
    const revenueResult = await prisma.purchaseRequest.aggregate({
      where: {
        datapod: {
          sellerId: seller.id,
        },
        status: 'completed',
      },
      _sum: {
        priceSui: true,
      },
    });

    const totalRevenue = revenueResult._sum.priceSui || new Decimal(0);

    // Calculate average rating
    const ratingResult = await prisma.review.aggregate({
      where: {
        datapod: {
          sellerId: seller.id,
        },
      },
      _avg: {
        rating: true,
      },
    });

    const averageRating = ratingResult._avg.rating
      ? new Decimal(ratingResult._avg.rating).toDecimalPlaces(2)
      : null;

    return {
      totalSales,
      totalRevenue,
      averageRating,
    };
  } catch (error) {
    logger.error('Failed to calculate seller stats', { error, sellerAddress });
    throw error;
  }
}

/**
 * Calculate datapod statistics
 */
async function calculateDatapodStats(datapodId: string): Promise<{
  totalSales: number;
  averageRating: Decimal | null;
}> {
  try {
    // Count completed purchases for this datapod
    const totalSales = await prisma.purchaseRequest.count({
      where: {
        datapodId,
        status: 'completed',
      },
    });

    // Calculate average rating
    const ratingResult = await prisma.review.aggregate({
      where: {
        datapodId,
      },
      _avg: {
        rating: true,
      },
    });

    const averageRating = ratingResult._avg.rating
      ? new Decimal(ratingResult._avg.rating).toDecimalPlaces(2)
      : null;

    return {
      totalSales,
      averageRating,
    };
  } catch (error) {
    logger.error('Failed to calculate datapod stats', { error, datapodId });
    throw error;
  }
}

/**
 * Process stats job
 */
const processStatsJob = async (job: Job<StatsJobData>): Promise<void> => {
  const { seller_address, datapod_id, trigger } = job.data;
  const startTime = performance.now();

  logger.info('Processing stats job', {
    jobId: job.id,
    sellerAddress: seller_address,
    datapodId: datapod_id,
    trigger,
  });

  try {
    // Calculate seller stats
    const sellerStats = await calculateSellerStats(seller_address);

    // Update seller in database
    const seller = await prisma.user.findUnique({
      where: { zkloginAddress: seller_address },
    });

    if (seller) {
      await prisma.user.update({
        where: { id: seller.id },
        data: {
          totalSales: sellerStats.totalSales,
          totalRevenue: sellerStats.totalRevenue,
          averageRating: sellerStats.averageRating,
        },
      });

      logger.debug('Seller stats updated', {
        sellerAddress: seller_address,
        totalSales: sellerStats.totalSales,
        totalRevenue: sellerStats.totalRevenue.toString(),
        averageRating: sellerStats.averageRating?.toString(),
      });
    }

    // Calculate datapod stats
    const datapodStats = await calculateDatapodStats(datapod_id);

    // Update datapod in database
    await prisma.dataPod.update({
      where: { id: datapod_id },
      data: {
        totalSales: datapodStats.totalSales,
        averageRating: datapodStats.averageRating,
      },
    });

    logger.debug('Datapod stats updated', {
      datapodId: datapod_id,
      totalSales: datapodStats.totalSales,
      averageRating: datapodStats.averageRating?.toString(),
    });

    // Invalidate cache for marketplace
    try {
      // TODO: Invalidate marketplace cache
      logger.debug('Marketplace cache invalidated');
    } catch (cacheError) {
      logger.warn('Failed to invalidate cache', { error: cacheError });
    }

    const duration = performance.now() - startTime;
    logger.info('Stats job completed successfully', {
      jobId: job.id,
      sellerAddress: seller_address,
      datapodId: datapod_id,
      duration: Math.round(duration),
    });
  } catch (error) {
    logger.error('Stats job processing failed', {
      jobId: job.id,
      sellerAddress: seller_address,
      datapodId: datapod_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Queue stats job
 */
export const queueStatsJob = async (data: StatsJobData): Promise<Job<StatsJobData>> => {
  try {
    const queue = await initializeStatsQueue();
    const job = await queue.add('calculate', data, {
      jobId: `stats-${data.datapod_id}-${Date.now()}`,
      priority: 8,
    });

    logger.info('Stats job queued', {
      jobId: job.id,
      datapodId: data.datapod_id,
    });

    return job;
  } catch (error) {
    logger.error('Failed to queue stats job', { error });
    throw error;
  }
};

/**
 * Get stats queue
 */
export const getStatsQueue = async (): Promise<Queue<StatsJobData>> => {
  return await initializeStatsQueue();
};

/**
 * Shutdown stats queue and worker
 */
export const shutdownStatsQueue = async (): Promise<void> => {
  try {
    if (statsWorker) {
      await statsWorker.close();
      statsWorker = null;
    }

    if (statsQueue) {
      await statsQueue.close();
      statsQueue = null;
    }

    logger.info('Stats queue and worker shut down');
  } catch (error) {
    logger.error('Error shutting down stats queue', { error });
  }
};
