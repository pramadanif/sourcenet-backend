import { PrismaClient } from '@prisma/client';
import { CacheService } from '@/services/cache.service';
import { logger } from '@/utils/logger';

export interface Checkpoint {
  lastEventId: string | null;
  lastTimestamp: number;
  processedCount: number;
  lastBlockHeight: number;
}

const CHECKPOINT_KEY = 'indexer:checkpoint';
const CHECKPOINT_DB_ID = 'indexer-checkpoint';

/**
 * Manages checkpoint state for event indexing
 * Persists to both Redis (fast) and database (durable)
 */
export class CheckpointManager {
  private prisma: PrismaClient;
  private cache: typeof CacheService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.cache = CacheService;
  }

  /**
   * Load checkpoint from cache or database
   */
  async loadCheckpoint(): Promise<Checkpoint> {
    try {
      // Try cache first
      const cached = await this.cache.getCachedData<Checkpoint>(CHECKPOINT_KEY);
      if (cached) {
        logger.debug('Checkpoint loaded from cache');
        return cached;
      }

      // Fall back to database
      const checkpoint = await this.getCheckpointFromDb();
      if (checkpoint) {
        // Update cache
        await this.cache.setCachedData(CHECKPOINT_KEY, checkpoint, 3600);
        logger.debug('Checkpoint loaded from database');
        return checkpoint;
      }

      // Initialize new checkpoint
      const newCheckpoint: Checkpoint = {
        lastEventId: null,
        lastTimestamp: Date.now(),
        processedCount: 0,
        lastBlockHeight: 0,
      };

      await this.saveCheckpoint(newCheckpoint);
      logger.info('New checkpoint initialized');
      return newCheckpoint;
    } catch (error) {
      logger.error('Failed to load checkpoint', { error });
      throw error;
    }
  }

  /**
   * Save checkpoint to both cache and database
   */
  async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    try {
      // Save to cache
      await this.cache.setCachedData(CHECKPOINT_KEY, checkpoint, 3600);

      // Save to database
      await this.saveCheckpointToDb(checkpoint);
      logger.debug('Checkpoint saved', {
        lastEventId: checkpoint.lastEventId,
        processedCount: checkpoint.processedCount,
      });
    } catch (error) {
      logger.error('Failed to save checkpoint', { error });
      throw error;
    }
  }

  /**
   * Get checkpoint from database
   */
  private async getCheckpointFromDb(): Promise<Checkpoint | null> {
    try {
      // Using raw query to store checkpoint as JSON
      const result = await this.prisma.$queryRaw<
        Array<{ data: any }>
      >`SELECT data FROM indexer_checkpoints WHERE id = ${CHECKPOINT_DB_ID}`;

      if (result && result.length > 0) {
        return result[0].data as Checkpoint;
      }
      return null;
    } catch (error) {
      logger.warn('Failed to load checkpoint from database', { error });
      return null;
    }
  }

  /**
   * Save checkpoint to database
   */
  private async saveCheckpointToDb(checkpoint: Checkpoint): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO indexer_checkpoints (id, data, updated_at)
        VALUES (${CHECKPOINT_DB_ID}, ${JSON.stringify(checkpoint)}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          data = ${JSON.stringify(checkpoint)},
          updated_at = NOW()
      `;
    } catch (error) {
      logger.error('Failed to save checkpoint to database', { error });
      throw error;
    }
  }

  /**
   * Update checkpoint with new event
   */
  async updateCheckpoint(
    eventId: string,
    timestamp: number,
    blockHeight: number,
  ): Promise<Checkpoint> {
    const checkpoint = await this.loadCheckpoint();
    checkpoint.lastEventId = eventId;
    checkpoint.lastTimestamp = timestamp;
    checkpoint.processedCount += 1;
    checkpoint.lastBlockHeight = blockHeight;

    await this.saveCheckpoint(checkpoint);
    return checkpoint;
  }

  /**
   * Detect and handle chain reorganization
   */
  async handleReorg(currentEventId: string, currentBlockHeight: number): Promise<boolean> {
    const checkpoint = await this.loadCheckpoint();

    // If block height went backwards, it's a reorg
    if (currentBlockHeight < checkpoint.lastBlockHeight) {
      logger.warn('Chain reorganization detected', {
        previousHeight: checkpoint.lastBlockHeight,
        currentHeight: currentBlockHeight,
      });

      // Reset checkpoint to safe state
      checkpoint.lastBlockHeight = currentBlockHeight;
      await this.saveCheckpoint(checkpoint);

      return true;
    }

    return false;
  }

  /**
   * Get current processing lag in seconds
   */
  async getProcessingLag(): Promise<number> {
    const checkpoint = await this.loadCheckpoint();
    const lagMs = Date.now() - checkpoint.lastTimestamp;
    return Math.floor(lagMs / 1000);
  }

  /**
   * Reset checkpoint (for testing or manual recovery)
   */
  async resetCheckpoint(): Promise<void> {
    const newCheckpoint: Checkpoint = {
      lastEventId: null,
      lastTimestamp: Date.now(),
      processedCount: 0,
      lastBlockHeight: 0,
    };

    await this.saveCheckpoint(newCheckpoint);
    logger.info('Checkpoint reset');
  }
}
