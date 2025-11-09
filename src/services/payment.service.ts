import prisma from '@/config/database';
import { logger } from '@/utils/logger';
import { BlockchainService } from './blockchain.service';
import { BlockchainError } from '@/types/errors.types';
import { Decimal } from '@prisma/client/runtime/library';

interface EscrowDetails {
  escrowId: string;
  purchaseRequestId: string;
  status: string;
  amount: Decimal;
  seller: string;
  buyer: string;
}

/**
 * Payment service for escrow and payment management
 */
export class PaymentService {
  /**
   * Create escrow for purchase
   */
  static async createEscrow(
    purchaseRequestId: string,
    amount: number,
    buyer: string,
    seller: string,
  ): Promise<EscrowDetails> {
    try {
      logger.info('Creating escrow', {
        purchaseRequestId,
        amount,
        buyer,
        seller,
      });

      // Create escrow transaction in database
      const escrow = await prisma.escrowTransaction.create({
        data: {
          purchaseRequestId,
          sellerId: seller, // This should be the seller's user ID from database
          sellerAddress: seller,
          buyerAddress: buyer,
          amountSui: new Decimal(amount),
          status: 'holding',
        },
      });

      logger.info('Escrow created successfully', {
        escrowId: escrow.id,
        status: escrow.status,
      });

      return {
        escrowId: escrow.id,
        purchaseRequestId: escrow.purchaseRequestId,
        status: escrow.status,
        amount: escrow.amountSui,
        seller: escrow.sellerAddress,
        buyer: escrow.buyerAddress,
      };
    } catch (error) {
      logger.error('Failed to create escrow', { error, purchaseRequestId });
      throw new BlockchainError('Failed to create escrow');
    }
  }

  /**
   * Release payment to seller
   */
  static async releasePayment(escrowId: string, seller: string): Promise<{ txDigest: string }> {
    try {
      logger.info('Releasing payment', { escrowId, seller });

      // Get escrow details
      const escrow = await prisma.escrowTransaction.findUnique({
        where: { id: escrowId },
      });

      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (escrow.status !== 'holding') {
        throw new Error(`Cannot release escrow with status: ${escrow.status}`);
      }

      // TODO: Build and execute blockchain transaction
      // For now, we'll simulate the transaction
      const txDigest = `0x${Buffer.from(`release_${escrowId}`).toString('hex')}`;

      // Update escrow status
      await prisma.escrowTransaction.update({
        where: { id: escrowId },
        data: {
          status: 'released',
          txDigest,
          releasedAt: new Date(),
        },
      });

      // Update purchase request status
      const escrowWithPurchase = await prisma.escrowTransaction.findUnique({
        where: { id: escrowId },
        include: { purchaseRequest: true },
      });

      if (escrowWithPurchase?.purchaseRequest) {
        await prisma.purchaseRequest.update({
          where: { id: escrowWithPurchase.purchaseRequest.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        });
      }

      logger.info('Payment released successfully', {
        escrowId,
        txDigest,
      });

      // Emit event: PaymentReleased
      // TODO: Implement event emission

      return { txDigest };
    } catch (error) {
      logger.error('Failed to release payment', { error, escrowId });
      throw new BlockchainError('Failed to release payment');
    }
  }

  /**
   * Refund payment to buyer
   */
  static async refundPayment(escrowId: string, buyer: string): Promise<{ txDigest: string }> {
    try {
      logger.info('Refunding payment', { escrowId, buyer });

      // Get escrow details
      const escrow = await prisma.escrowTransaction.findUnique({
        where: { id: escrowId },
      });

      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (escrow.status === 'released') {
        throw new Error('Cannot refund already released payment');
      }

      // TODO: Build and execute blockchain transaction
      // For now, we'll simulate the transaction
      const txDigest = `0x${Buffer.from(`refund_${escrowId}`).toString('hex')}`;

      // Update escrow status
      await prisma.escrowTransaction.update({
        where: { id: escrowId },
        data: {
          status: 'refunded',
          txDigest,
        },
      });

      // Update purchase request status
      const escrowWithPurchase = await prisma.escrowTransaction.findUnique({
        where: { id: escrowId },
        include: { purchaseRequest: true },
      });

      if (escrowWithPurchase?.purchaseRequest) {
        await prisma.purchaseRequest.update({
          where: { id: escrowWithPurchase.purchaseRequest.id },
          data: {
            status: 'refunded',
          },
        });
      }

      logger.info('Payment refunded successfully', {
        escrowId,
        txDigest,
      });

      // Emit event: PaymentRefunded
      // TODO: Implement event emission

      return { txDigest };
    } catch (error) {
      logger.error('Failed to refund payment', { error, escrowId });
      throw new BlockchainError('Failed to refund payment');
    }
  }

  /**
   * Get escrow status
   */
  static async getEscrowStatus(escrowId: string): Promise<string> {
    try {
      const escrow = await prisma.escrowTransaction.findUnique({
        where: { id: escrowId },
      });

      if (!escrow) {
        throw new Error('Escrow not found');
      }

      return escrow.status;
    } catch (error) {
      logger.error('Failed to get escrow status', { error, escrowId });
      throw new BlockchainError('Failed to fetch escrow status');
    }
  }

  /**
   * Get escrow details
   */
  static async getEscrowDetails(escrowId: string): Promise<EscrowDetails | null> {
    try {
      const escrow = await prisma.escrowTransaction.findUnique({
        where: { id: escrowId },
      });

      if (!escrow) {
        return null;
      }

      return {
        escrowId: escrow.id,
        purchaseRequestId: escrow.purchaseRequestId,
        status: escrow.status,
        amount: escrow.amountSui,
        seller: escrow.sellerAddress,
        buyer: escrow.buyerAddress,
      };
    } catch (error) {
      logger.error('Failed to get escrow details', { error, escrowId });
      throw new BlockchainError('Failed to fetch escrow details');
    }
  }

  /**
   * Get escrow by purchase request ID
   */
  static async getEscrowByPurchaseId(purchaseRequestId: string): Promise<EscrowDetails | null> {
    try {
      const escrow = await prisma.escrowTransaction.findUnique({
        where: { purchaseRequestId },
      });

      if (!escrow) {
        return null;
      }

      return {
        escrowId: escrow.id,
        purchaseRequestId: escrow.purchaseRequestId,
        status: escrow.status,
        amount: escrow.amountSui,
        seller: escrow.sellerAddress,
        buyer: escrow.buyerAddress,
      };
    } catch (error) {
      logger.error('Failed to get escrow by purchase ID', { error, purchaseRequestId });
      throw new BlockchainError('Failed to fetch escrow by purchase ID');
    }
  }

  /**
   * Get all escrows for seller
   */
  static async getSellerEscrows(sellerAddress: string): Promise<EscrowDetails[]> {
    try {
      const escrows = await prisma.escrowTransaction.findMany({
        where: { sellerAddress },
        orderBy: { createdAt: 'desc' },
      });

      return escrows.map((escrow: any) => ({
        escrowId: escrow.id,
        purchaseRequestId: escrow.purchaseRequestId,
        status: escrow.status,
        amount: escrow.amountSui,
        seller: escrow.sellerAddress,
        buyer: escrow.buyerAddress,
      }));
    } catch (error) {
      logger.error('Failed to get seller escrows', { error, sellerAddress });
      throw new BlockchainError('Failed to fetch seller escrows');
    }
  }

  /**
   * Get all escrows for buyer
   */
  static async getBuyerEscrows(buyerAddress: string): Promise<EscrowDetails[]> {
    try {
      const escrows = await prisma.escrowTransaction.findMany({
        where: { buyerAddress },
        orderBy: { createdAt: 'desc' },
      });

      return escrows.map((escrow: any) => ({
        escrowId: escrow.id,
        purchaseRequestId: escrow.purchaseRequestId,
        status: escrow.status,
        amount: escrow.amountSui,
        seller: escrow.sellerAddress,
        buyer: escrow.buyerAddress,
      }));
    } catch (error) {
      logger.error('Failed to get buyer escrows', { error, buyerAddress });
      throw new BlockchainError('Failed to fetch buyer escrows');
    }
  }

  /**
   * Calculate total held in escrow for seller
   */
  static async getSellerHeldAmount(sellerAddress: string): Promise<Decimal> {
    try {
      const result = await prisma.escrowTransaction.aggregate({
        where: {
          sellerAddress,
          status: 'holding',
        },
        _sum: {
          amountSui: true,
        },
      });

      return result._sum.amountSui || new Decimal(0);
    } catch (error) {
      logger.error('Failed to calculate seller held amount', { error, sellerAddress });
      throw new BlockchainError('Failed to calculate held amount');
    }
  }
}
