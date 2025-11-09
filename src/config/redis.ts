import Redis from 'ioredis';
import { logger } from '@/utils/logger';
import { env } from './env';

let redisClient: Redis | null = null;

/**
 * Initialize Redis client
 */
export function initializeRedis(): Redis {
  if (redisClient) {
    return redisClient;
  }

  try {
    const redisUrl = new URL(env.REDIS_URL);

    redisClient = new Redis({
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || '6379'),
      password: redisUrl.password || env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      enableOfflineQueue: true,
    });

    // Event handlers
    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('error', (error) => {
      logger.error('Redis error', { error: error.message });
    });

    redisClient.on('close', () => {
      logger.info('Redis connection closed');
    });

    logger.info('Redis client initialized', {
      host: redisUrl.hostname,
      port: redisUrl.port || 6379,
      db: env.REDIS_DB,
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis', { error });
    throw error;
  }
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    return initializeRedis();
  }
  return redisClient;
}

/**
 * Disconnect Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected');
  }
}

/**
 * Redis configuration
 */
export const redisConfig = {
  // Connection
  url: env.REDIS_URL,
  db: env.REDIS_DB,

  // Key prefixes
  keyPrefix: 'sourcenet:',

  // TTLs (in seconds)
  ttl: {
    default: 3600, // 1 hour
    checkpoint: 3600, // 1 hour
    cache: 300, // 5 minutes
    session: 86400, // 24 hours
    temp: 60, // 1 minute
  },

  // Retry settings
  maxRetries: 3,
  retryDelayMs: 1000,
};

export default redisConfig;
