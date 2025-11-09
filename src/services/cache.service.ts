import Redis, { RedisOptions } from 'ioredis';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';

const DEFAULT_TTL = 3600; // 1 hour
const MARKETPLACE_TTL = 3600; // 1 hour
const DATAPOD_TTL = 1800; // 30 minutes

/**
 * Cache service for Redis caching
 */
export class CacheService {
  private static redis: Redis | null = null;

  /**
   * Initialize Redis client
   */
  static initializeRedis(): Redis {
    if (this.redis) {
      return this.redis;
    }

    try {
      this.redis = new Redis({
        host: new URL(env.REDIS_URL).hostname || 'localhost',
        port: parseInt(new URL(env.REDIS_URL).port || '6379'),
        password: env.REDIS_PASSWORD,
        db: env.REDIS_DB,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
      });

      this.redis.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.redis.on('error', (error: Error) => {
        logger.error('Redis error', { error: error.message });
      });

      this.redis.on('ready', () => {
        logger.info('Redis client ready');
      });

      return this.redis;
    } catch (error) {
      logger.error('Failed to initialize Redis', { error });
      throw error;
    }
  }

  /**
   * Get Redis client instance
   */
  static getClient(): Redis {
    if (!this.redis) {
      return this.initializeRedis();
    }
    return this.redis;
  }

  /**
   * Get cached data
   */
  static async getCachedData<T>(key: string): Promise<T | null> {
    try {
      const redis = this.getClient();
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      try {
        return JSON.parse(data) as T;
      } catch {
        // If not JSON, return as string
        return data as unknown as T;
      }
    } catch (error) {
      logger.warn('Failed to get cached data', { key, error });
      return null;
    }
  }

  /**
   * Set cached data with TTL
   */
  static async setCachedData<T>(
    key: string,
    value: T,
    ttl: number = DEFAULT_TTL,
  ): Promise<void> {
    try {
      const redis = this.getClient();
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);

      await redis.setex(key, ttl, serialized);
      logger.debug('Data cached', { key, ttl });
    } catch (error) {
      logger.warn('Failed to set cached data', { key, error });
      // Don't throw - caching failure shouldn't break the app
    }
  }

  /**
   * Delete cached data
   */
  static async deleteCachedData(key: string): Promise<void> {
    try {
      const redis = this.getClient();
      await redis.del(key);
      logger.debug('Cache deleted', { key });
    } catch (error) {
      logger.warn('Failed to delete cached data', { key, error });
    }
  }

  /**
   * Invalidate cache by pattern
   */
  static async invalidateCache(pattern: string): Promise<number> {
    try {
      const redis = this.getClient();
      const keys = await redis.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await redis.del(...keys);
      logger.info('Cache invalidated', { pattern, count: deleted });
      return deleted;
    } catch (error) {
      logger.warn('Failed to invalidate cache', { pattern, error });
      return 0;
    }
  }

  /**
   * Invalidate cache by prefix
   */
  static async invalidateCacheByPrefix(prefix: string): Promise<void> {
    await this.invalidateCache(`${prefix}:*`);
  }

  /**
   * Cache marketplace data
   */
  static async cacheMarketplaceData(
    page: number,
    filters: Record<string, any>,
    data: any,
  ): Promise<void> {
    try {
      const key = this.generateMarketplaceCacheKey(page, filters);
      await this.setCachedData(key, data, MARKETPLACE_TTL);
    } catch (error) {
      logger.warn('Failed to cache marketplace data', { error });
    }
  }

  /**
   * Get cached marketplace data
   */
  static async getMarketplaceCache(
    page: number,
    filters: Record<string, any>,
  ): Promise<any | null> {
    try {
      const key = this.generateMarketplaceCacheKey(page, filters);
      return await this.getCachedData(key);
    } catch (error) {
      logger.warn('Failed to get marketplace cache', { error });
      return null;
    }
  }

  /**
   * Cache DataPod details
   */
  static async cacheDataPodDetails(datapodId: string, data: any): Promise<void> {
    try {
      const key = `datapod:${datapodId}`;
      await this.setCachedData(key, data, DATAPOD_TTL);
    } catch (error) {
      logger.warn('Failed to cache DataPod details', { error });
    }
  }

  /**
   * Get cached DataPod details
   */
  static async getDataPodCache(datapodId: string): Promise<any | null> {
    try {
      const key = `datapod:${datapodId}`;
      return await this.getCachedData(key);
    } catch (error) {
      logger.warn('Failed to get DataPod cache', { error });
      return null;
    }
  }

  /**
   * Invalidate DataPod cache
   */
  static async invalidateDataPodCache(datapodId: string): Promise<void> {
    await this.deleteCachedData(`datapod:${datapodId}`);
  }

  /**
   * Cache seller profile
   */
  static async cacheSellerProfile(sellerId: string, data: any): Promise<void> {
    try {
      const key = `seller:${sellerId}`;
      await this.setCachedData(key, data, MARKETPLACE_TTL);
    } catch (error) {
      logger.warn('Failed to cache seller profile', { error });
    }
  }

  /**
   * Get cached seller profile
   */
  static async getSellerProfileCache(sellerId: string): Promise<any | null> {
    try {
      const key = `seller:${sellerId}`;
      return await this.getCachedData(key);
    } catch (error) {
      logger.warn('Failed to get seller profile cache', { error });
      return null;
    }
  }

  /**
   * Invalidate seller cache
   */
  static async invalidateSellerCache(sellerId: string): Promise<void> {
    await this.invalidateCacheByPrefix(`seller:${sellerId}`);
  }

  /**
   * Cache top-rated DataPods
   */
  static async cacheTopRated(data: any): Promise<void> {
    try {
      const key = 'marketplace:top-rated';
      await this.setCachedData(key, data, 21600); // 6 hours
    } catch (error) {
      logger.warn('Failed to cache top-rated data', { error });
    }
  }

  /**
   * Get cached top-rated DataPods
   */
  static async getTopRatedCache(): Promise<any | null> {
    try {
      const key = 'marketplace:top-rated';
      return await this.getCachedData(key);
    } catch (error) {
      logger.warn('Failed to get top-rated cache', { error });
      return null;
    }
  }

  /**
   * Invalidate all marketplace cache
   */
  static async invalidateMarketplaceCache(): Promise<number> {
    return await this.invalidateCache('marketplace:*');
  }

  /**
   * Generate marketplace cache key
   */
  private static generateMarketplaceCacheKey(
    page: number,
    filters: Record<string, any>,
  ): string {
    const filterStr = Object.entries(filters)
      .sort()
      .map(([key, value]) => `${key}:${value}`)
      .join('|');

    return `marketplace:page:${page}:${filterStr}`;
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats(): Promise<any> {
    try {
      const redis = this.getClient();
      const info = await redis.info('stats');
      return info;
    } catch (error) {
      logger.warn('Failed to get cache stats', { error });
      return null;
    }
  }

  /**
   * Clear all cache
   */
  static async clearAllCache(): Promise<void> {
    try {
      const redis = this.getClient();
      await redis.flushdb();
      logger.info('All cache cleared');
    } catch (error) {
      logger.warn('Failed to clear all cache', { error });
    }
  }

  /**
   * Disconnect Redis
   */
  static async disconnect(): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.quit();
        this.redis = null;
        logger.info('Redis disconnected');
      }
    } catch (error) {
      logger.warn('Failed to disconnect Redis', { error });
    }
  }
}
