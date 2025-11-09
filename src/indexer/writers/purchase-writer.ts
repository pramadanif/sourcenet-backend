import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';
import { TransformedPurchaseRequest, TransformedPurchaseCompleted } from '@/indexer/transformers/purchase-transformer';

/**
 * Purchase writer for persisting purchase events to database
 */
export class PurchaseWriter {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Write purchase request
   */
  async writePurchaseRequest(purchase: TransformedPurchaseRequest): Promise<void> {
    try {
      // Find or create buyer user
      let buyer = await this.prisma.user.findUnique({
        where: { zkloginAddress: purchase.buyer_address },
      });

      if (!buyer) {
        buyer = await this.prisma.user.create({
          data: {
            zkloginAddress: purchase.buyer_address,
            username: `buyer_${purchase.buyer_address.slice(0, 8)}`,
          },
        });
        logger.debug('Created new buyer user', { buyerId: buyer.id, address: purchase.buyer_address });
      }

      // Find datapod
      const datapod = await this.prisma.dataPod.findUnique({
        where: { datapodId: purchase.datapod_id },
      });

      if (!datapod) {
        logger.warn('DataPod not found for purchase', { datapodId: purchase.datapod_id });
        return;
      }

      // Upsert purchase request
      const result = await this.prisma.purchaseRequest.upsert({
        where: { purchaseRequestId: purchase.purchase_request_id },
        update: {
          status: purchase.status,
          updatedAt: new Date(),
        },
        create: {
          purchaseRequestId: purchase.purchase_request_id,
          datapodId: datapod.id,
          buyerId: buyer.id,
          buyerAddress: purchase.buyer_address,
          sellerAddress: purchase.seller_address,
          buyerPublicKey: '', // Will be fetched from user profile
          priceSui: purchase.price_sui,
          status: purchase.status,
          createdAt: purchase.created_at,
          updatedAt: new Date(),
        },
      });

      logger.debug('Purchase request written', {
        purchaseRequestId: result.purchaseRequestId,
        datapodId: result.datapodId,
        status: result.status,
      });
    } catch (error) {
      logger.error('Failed to write purchase request', { error, purchaseId: purchase.purchase_request_id });
      throw error;
    }
  }

  /**
   * Complete purchase
   */
  async completePurchase(purchase: TransformedPurchaseCompleted): Promise<void> {
    try {
      const result = await this.prisma.purchaseRequest.update({
        where: { purchaseRequestId: purchase.purchase_request_id },
        data: {
          status: purchase.status,
          encryptedBlobId: purchase.encrypted_blob_id,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.debug('Purchase completed', {
        purchaseRequestId: result.purchaseRequestId,
        status: result.status,
      });
    } catch (error) {
      logger.error('Failed to complete purchase', { error, purchaseId: purchase.purchase_request_id });
      throw error;
    }
  }

  /**
   * Create escrow transaction
   */
  async createEscrow(
    purchaseRequestId: string,
    sellerAddress: string,
    buyerAddress: string,
    amountSui: string,
  ): Promise<void> {
    try {
      // Find purchase request
      const purchase = await this.prisma.purchaseRequest.findUnique({
        where: { purchaseRequestId },
      });

      if (!purchase) {
        logger.warn('Purchase request not found for escrow', { purchaseRequestId });
        return;
      }

      // Find seller
      const seller = await this.prisma.user.findUnique({
        where: { zkloginAddress: sellerAddress },
      });

      if (!seller) {
        logger.warn('Seller not found for escrow', { sellerAddress });
        return;
      }

      // Create escrow transaction
      const result = await this.prisma.escrowTransaction.upsert({
        where: { purchaseRequestId },
        update: {
          amountSui,
          updatedAt: new Date(),
        },
        create: {
          purchaseRequestId,
          sellerId: seller.id,
          sellerAddress,
          buyerAddress,
          amountSui,
          status: 'holding',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.debug('Escrow transaction created', {
        escrowId: result.id,
        purchaseRequestId: result.purchaseRequestId,
        amountSui: result.amountSui,
      });
    } catch (error) {
      logger.error('Failed to create escrow', { error, purchaseRequestId });
      throw error;
    }
  }

  /**
   * Release escrow payment
   */
  async releaseEscrow(purchaseRequestId: string): Promise<void> {
    try {
      const result = await this.prisma.escrowTransaction.update({
        where: { purchaseRequestId },
        data: {
          status: 'released',
          releasedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.debug('Escrow released', {
        escrowId: result.id,
        purchaseRequestId: result.purchaseRequestId,
        amountSui: result.amountSui,
      });
    } catch (error) {
      logger.error('Failed to release escrow', { error, purchaseRequestId });
      throw error;
    }
  }
}
