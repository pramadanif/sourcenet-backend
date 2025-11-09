import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import prisma from '@/config/database';
import { logger } from '@/utils/logger';
import { EncryptionService } from '@/services/encryption.service';
import { BlockchainService } from '@/services/blockchain.service';
import { PaymentService } from '@/services/payment.service';
import { StorageService } from '@/services/storage.service';
import { CacheService } from '@/services/cache.service';
import { ValidationError, BlockchainError } from '@/types/errors.types';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Create purchase endpoint
 */
export const createPurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datapod_id, buyer_address, buyer_public_key } = req.body;

    if (!datapod_id || !buyer_address || !buyer_public_key) {
      throw new ValidationError('Missing required fields: datapod_id, buyer_address, buyer_public_key');
    }

    // Verify DataPod exists and is available
    const datapod = await prisma.dataPod.findUnique({
      where: { datapodId: datapod_id },
    });

    if (!datapod) {
      throw new ValidationError('DataPod not found');
    }

    if (datapod.status !== 'published') {
      throw new ValidationError(`DataPod status is ${datapod.status}, expected published`);
    }

    // Get seller details
    const seller = await prisma.user.findUnique({
      where: { id: datapod.sellerId },
    });

    if (!seller) {
      throw new ValidationError('Seller not found');
    }

    logger.info('Creating purchase', {
      requestId: req.requestId,
      datapodId: datapod_id,
      buyerAddress: buyer_address,
      price: datapod.priceSui.toString(),
    });

    // Verify buyer's balance
    try {
      const balance = await BlockchainService.getBalance(buyer_address);
      const requiredAmount = BigInt(Math.floor(datapod.priceSui.toNumber() * 1e9)) + BigInt(10000000); // Add 0.01 SUI for gas

      if (balance < requiredAmount) {
        res.status(402).json({
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: 'Insufficient balance for purchase',
            statusCode: 402,
            requestId: req.requestId,
            details: {
              required: (requiredAmount / BigInt(1e9)).toString(),
              available: (balance / BigInt(1e9)).toString(),
            },
          },
        });
        return;
      }
    } catch (error) {
      logger.warn('Balance check failed', { error, buyerAddress: buyer_address });
      // Continue anyway - blockchain might be temporarily unavailable
    }

    // Verify buyer_public_key format (X25519 public key = 32 bytes)
    let publicKeyBuffer: Buffer;
    try {
      publicKeyBuffer = Buffer.from(buyer_public_key, 'base64');
      if (publicKeyBuffer.length !== 32) {
        throw new Error('Invalid key length');
      }
    } catch (error) {
      throw new ValidationError('Invalid buyer_public_key: must be base64-encoded 32-byte X25519 public key');
    }

    // TODO: Build PTB transaction
    // For now, create mock transaction
    const purchaseRequestId = `0x${randomUUID().replace(/-/g, '')}`;
    const escrowId = `0x${randomUUID().replace(/-/g, '')}`;
    const txDigest = `0x${randomUUID().replace(/-/g, '')}`;

    // Record in database
    const purchaseRequest = await prisma.purchaseRequest.create({
      data: {
        purchaseRequestId,
        datapodId: datapod.id,
        buyerId: req.user!.address, // Will need to map to user ID
        buyerAddress: buyer_address,
        sellerAddress: seller.zkloginAddress,
        buyerPublicKey: buyer_public_key,
        priceSui: datapod.priceSui,
        status: 'pending',
        txDigest,
      },
    });

    // Create escrow transaction
    const escrow = await PaymentService.createEscrow(
      purchaseRequest.id,
      datapod.priceSui.toNumber(),
      buyer_address,
      seller.zkloginAddress,
    );

    logger.info('Purchase created', {
      requestId: req.requestId,
      purchaseRequestId,
      escrowId: escrow.escrowId,
    });

    // TODO: Queue fulfillment job

    res.status(200).json({
      status: 'success',
      purchase_request_id: purchaseRequestId,
      escrow_status: 'active',
      tx_digest: txDigest,
      message: 'Payment locked in escrow',
    });
  } catch (error) {
    logger.error('Purchase creation failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Download purchased data endpoint
 */
export const downloadData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_request_id } = req.params;
    const { buyer_private_key } = req.body;

    if (!purchase_request_id) {
      throw new ValidationError('Missing purchase_request_id');
    }

    if (!buyer_private_key) {
      throw new ValidationError('Missing buyer_private_key for decryption');
    }

    // Get purchase request
    const purchaseRequest = await prisma.purchaseRequest.findUnique({
      where: { id: purchase_request_id },
      include: { datapod: true },
    });

    if (!purchaseRequest) {
      throw new ValidationError('Purchase request not found');
    }

    if (purchaseRequest.status !== 'completed') {
      throw new ValidationError(`Purchase status is ${purchaseRequest.status}, expected completed`);
    }

    // Verify buyer owns this purchase
    if (purchaseRequest.buyerAddress !== req.user!.address) {
      throw new ValidationError('Unauthorized: buyer does not own this purchase');
    }

    logger.info('Downloading data', {
      requestId: req.requestId,
      purchaseRequestId: purchase_request_id,
    });

    // Download encrypted blob from Walrus
    if (!purchaseRequest.encryptedBlobId) {
      throw new ValidationError('Encrypted blob not found for this purchase');
    }

    const encryptedData = await StorageService.downloadFromWalrus(purchaseRequest.encryptedBlobId);

    // Decrypt data using buyer's private key
    const decryptedData = await EncryptionService.hybridDecrypt(
      purchaseRequest.decryptionKey || '',
      encryptedData.toString('base64'),
      '', // nonce - would be stored in DB
      '', // tag - would be stored in DB
      buyer_private_key,
    );

    logger.info('Data decrypted successfully', {
      requestId: req.requestId,
      purchaseRequestId: purchase_request_id,
    });

    // Send file
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${purchaseRequest.datapod?.title || 'data'}.bin"`,
    );
    res.send(decryptedData);
  } catch (error) {
    logger.error('Download failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Get buyer's purchases
 */
export const getBuyerPurchases = async (req: Request, res: Response): Promise<void> => {
  try {
    const purchases = await prisma.purchaseRequest.findMany({
      where: {
        buyerAddress: req.user!.address,
      },
      include: {
        datapod: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.status(200).json({
      status: 'success',
      count: purchases.length,
      purchases,
    });
  } catch (error) {
    logger.error('Get buyer purchases failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Get purchase details
 */
export const getPurchaseDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_request_id } = req.params;

    const purchase = await prisma.purchaseRequest.findUnique({
      where: { id: purchase_request_id },
      include: {
        datapod: {
          include: {
            seller: true,
          },
        },
      },
    });

    if (!purchase) {
      throw new ValidationError('Purchase not found');
    }

    // Verify buyer owns this purchase
    if (purchase.buyerAddress !== req.user!.address) {
      throw new ValidationError('Unauthorized: buyer does not own this purchase');
    }

    res.status(200).json({
      status: 'success',
      purchase,
    });
  } catch (error) {
    logger.error('Get purchase details failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Submit review for purchase
 */
export const submitReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_request_id } = req.params;
    const { rating, comment } = req.body;

    if (!purchase_request_id) {
      throw new ValidationError('Missing purchase_request_id');
    }

    if (!rating || rating < 1 || rating > 5) {
      throw new ValidationError('Rating must be between 1 and 5');
    }

    // Get purchase request
    const purchase = await prisma.purchaseRequest.findUnique({
      where: { id: purchase_request_id },
      include: { datapod: true },
    });

    if (!purchase) {
      throw new ValidationError('Purchase not found');
    }

    if (purchase.status !== 'completed') {
      throw new ValidationError('Can only review completed purchases');
    }

    // Verify buyer owns this purchase
    if (purchase.buyerAddress !== req.user!.address) {
      throw new ValidationError('Unauthorized: buyer does not own this purchase');
    }

    logger.info('Submitting review', {
      requestId: req.requestId,
      purchaseRequestId: purchase_request_id,
      rating,
    });

    // Create review
    const review = await prisma.review.create({
      data: {
        datapodId: purchase.datapod!.id,
        purchaseRequestId: purchase.id,
        buyerId: req.user!.address, // Will need to map to user ID
        buyerAddress: purchase.buyerAddress,
        rating,
        comment: comment || '',
      },
    });

    // Update DataPod average rating
    const reviews = await prisma.review.findMany({
      where: { datapodId: purchase.datapod!.id },
    });

    const avgRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length;

    await prisma.dataPod.update({
      where: { id: purchase.datapod!.id },
      data: {
        averageRating: new Decimal(avgRating),
      },
    });

    // Invalidate cache
    await CacheService.invalidateDataPodCache(purchase.datapod!.datapodId);
    await CacheService.invalidateMarketplaceCache();

    logger.info('Review submitted', {
      requestId: req.requestId,
      reviewId: review.id,
    });

    res.status(200).json({
      status: 'success',
      review,
      message: 'Review submitted successfully',
    });
  } catch (error) {
    logger.error('Submit review failed', { error, requestId: req.requestId });
    throw error;
  }
};
