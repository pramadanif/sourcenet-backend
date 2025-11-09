import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';
import { TransformedDataPod } from '@/indexer/transformers/datapod-transformer';

/**
 * DataPod writer for persisting datapod events to database
 */
export class DataPodWriter {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Write or update datapod
   */
  async writeDataPod(datapod: TransformedDataPod): Promise<void> {
    try {
      // First, find or create seller user by address
      let seller = await this.prisma.user.findUnique({
        where: { zkloginAddress: datapod.seller_address },
      });

      if (!seller) {
        seller = await this.prisma.user.create({
          data: {
            zkloginAddress: datapod.seller_address,
            username: `seller_${datapod.seller_address.slice(0, 8)}`,
          },
        });
        logger.debug('Created new seller user', { sellerId: seller.id, address: datapod.seller_address });
      }

      // Upsert datapod
      const result = await this.prisma.dataPod.upsert({
        where: { datapodId: datapod.datapod_id },
        update: {
          title: datapod.title,
          category: datapod.category,
          priceSui: datapod.price_sui,
          status: datapod.status,
          publishedAt: datapod.published_at,
          updatedAt: new Date(),
        },
        create: {
          datapodId: datapod.datapod_id,
          sellerId: seller.id,
          title: datapod.title,
          category: datapod.category,
          priceSui: datapod.price_sui,
          dataHash: datapod.datapod_id, // Use datapod_id as hash for now
          status: datapod.status,
          publishedAt: datapod.published_at,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.debug('DataPod written', {
        datapodId: result.datapodId,
        title: result.title,
        status: result.status,
      });
    } catch (error) {
      logger.error('Failed to write datapod', { error, datapodId: datapod.datapod_id });
      throw error;
    }
  }

  /**
   * Delist datapod
   */
  async delistDataPod(datapodId: string): Promise<void> {
    try {
      const result = await this.prisma.dataPod.update({
        where: { datapodId },
        data: {
          status: 'delisted',
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.debug('DataPod delisted', { datapodId: result.datapodId });
    } catch (error) {
      logger.error('Failed to delist datapod', { error, datapodId });
      throw error;
    }
  }

  /**
   * Update datapod stats
   */
  async updateDataPodStats(
    datapodId: string,
    totalSales: number,
    averageRating: number | null,
  ): Promise<void> {
    try {
      await this.prisma.dataPod.update({
        where: { datapodId },
        data: {
          totalSales,
          averageRating: averageRating ? averageRating.toString() : null,
          updatedAt: new Date(),
        },
      });

      logger.debug('DataPod stats updated', { datapodId, totalSales, averageRating });
    } catch (error) {
      logger.error('Failed to update datapod stats', { error, datapodId });
      throw error;
    }
  }
}
