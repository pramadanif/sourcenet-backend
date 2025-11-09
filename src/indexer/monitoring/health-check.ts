import { SuiClient } from '@mysten/sui/client';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { logger } from '@/utils/logger';
import { BlockchainService } from '@/services/blockchain.service';
import { CacheService } from '@/services/cache.service';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: {
    blockchain: CheckResult;
    database: CheckResult;
    redis: CheckResult;
    processingLag: CheckResult;
  };
  metrics: {
    blockchainLatencyMs: number;
    databaseLatencyMs: number;
    redisLatencyMs: number;
  };
}

export interface CheckResult {
  status: 'ok' | 'warning' | 'error';
  message: string;
  lastChecked: Date;
  details?: any;
}

const BLOCKCHAIN_TIMEOUT_MS = 5000;
const DATABASE_TIMEOUT_MS = 3000;
const REDIS_TIMEOUT_MS = 2000;
const LAG_WARNING_THRESHOLD_S = 10;
const LAG_ERROR_THRESHOLD_S = 60;

/**
 * Health check monitor for indexer services
 */
export class HealthCheckMonitor {
  private client: SuiClient;
  private prisma: PrismaClient;
  private redis: Redis;
  private lastHealthStatus: HealthStatus | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.client = BlockchainService.getClient();
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(intervalMs: number = 30000): void {
    if (this.checkInterval) {
      logger.warn('Health checks already running');
      return;
    }

    logger.info('Starting periodic health checks', { intervalMs });
    this.checkInterval = setInterval(() => this.performHealthCheck(), intervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Health checks stopped');
    }
  }

  /**
   * Perform full health check
   */
  async performHealthCheck(): Promise<HealthStatus> {
    try {
      const [blockchainCheck, databaseCheck, redisCheck] = await Promise.all([
        this.checkBlockchain(),
        this.checkDatabase(),
        this.checkRedis(),
      ]);

      const processingLagCheck = await this.checkProcessingLag();

      // Determine overall status
      const checks = {
        blockchain: blockchainCheck,
        database: databaseCheck,
        redis: redisCheck,
        processingLag: processingLagCheck,
      };

      const hasError = Object.values(checks).some((c) => c.status === 'error');
      const hasWarning = Object.values(checks).some((c) => c.status === 'warning');

      const status: HealthStatus = {
        status: hasError ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy',
        timestamp: new Date(),
        checks,
        metrics: {
          blockchainLatencyMs: this.extractLatency(blockchainCheck),
          databaseLatencyMs: this.extractLatency(databaseCheck),
          redisLatencyMs: this.extractLatency(redisCheck),
        },
      };

      this.lastHealthStatus = status;

      if (status.status !== 'healthy') {
        logger.warn('Health check detected issues', {
          status: status.status,
          checks: Object.entries(checks).map(([key, val]) => ({
            [key]: { status: val.status, message: val.message },
          })),
        });
      }

      return status;
    } catch (error) {
      logger.error('Health check failed', { error });
      throw error;
    }
  }

  /**
   * Check blockchain connectivity
   */
  private async checkBlockchain(): Promise<CheckResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Blockchain check timeout')), BLOCKCHAIN_TIMEOUT_MS),
      );

      await Promise.race([this.client.getRpcApiVersion(), timeoutPromise]);

      const latency = Date.now() - startTime;
      return {
        status: 'ok',
        message: 'Blockchain RPC responding',
        lastChecked: new Date(),
        details: { latencyMs: latency },
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        status: 'error',
        message: `Blockchain check failed: ${(error as Error).message}`,
        lastChecked: new Date(),
        details: { latencyMs: latency, error: (error as Error).message },
      };
    }
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<CheckResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database check timeout')), DATABASE_TIMEOUT_MS),
      );

      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeoutPromise]);

      const latency = Date.now() - startTime;
      return {
        status: 'ok',
        message: 'Database connection healthy',
        lastChecked: new Date(),
        details: { latencyMs: latency },
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        status: 'error',
        message: `Database check failed: ${(error as Error).message}`,
        lastChecked: new Date(),
        details: { latencyMs: latency, error: (error as Error).message },
      };
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<CheckResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis check timeout')), REDIS_TIMEOUT_MS),
      );

      await Promise.race([this.redis.ping(), timeoutPromise]);

      const latency = Date.now() - startTime;
      return {
        status: 'ok',
        message: 'Redis connection healthy',
        lastChecked: new Date(),
        details: { latencyMs: latency },
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        status: 'warning', // Redis is non-critical
        message: `Redis check failed: ${(error as Error).message}`,
        lastChecked: new Date(),
        details: { latencyMs: latency, error: (error as Error).message },
      };
    }
  }

  /**
   * Check processing lag
   */
  private async checkProcessingLag(): Promise<CheckResult> {
    try {
      const checkpoint = await CacheService.getCachedData<any>('indexer:checkpoint');
      if (!checkpoint) {
        return {
          status: 'ok',
          message: 'No checkpoint yet',
          lastChecked: new Date(),
        };
      }

      const parsed = JSON.parse(checkpoint);
      const lagSeconds = Math.floor((Date.now() - parsed.lastTimestamp) / 1000);

      if (lagSeconds > LAG_ERROR_THRESHOLD_S) {
        return {
          status: 'error',
          message: `Processing lag critical: ${lagSeconds}s`,
          lastChecked: new Date(),
          details: { lagSeconds },
        };
      }

      if (lagSeconds > LAG_WARNING_THRESHOLD_S) {
        return {
          status: 'warning',
          message: `Processing lag warning: ${lagSeconds}s`,
          lastChecked: new Date(),
          details: { lagSeconds },
        };
      }

      return {
        status: 'ok',
        message: `Processing lag normal: ${lagSeconds}s`,
        lastChecked: new Date(),
        details: { lagSeconds },
      };
    } catch (error) {
      return {
        status: 'warning',
        message: `Failed to check processing lag: ${(error as Error).message}`,
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Extract latency from check result
   */
  private extractLatency(check: CheckResult): number {
    return check.details?.latencyMs || 0;
  }

  /**
   * Get last health status
   */
  getLastStatus(): HealthStatus | null {
    return this.lastHealthStatus;
  }
}
