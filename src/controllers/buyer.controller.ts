import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import prisma from '@/config/database';
import { logger } from '@/utils/logger';
import { EncryptionService } from '@/services/encryption.service';
import { BlockchainService } from '@/services/blockchain.service';
import { PaymentService } from '@/services/payment.service';
import { StorageService } from '@/services/storage.service';
import { CacheService } from '@/services/cache.service';
import { queueFulfillmentJob } from '@/jobs/fulfillment.job';
import { ValidationError, BlockchainError } from '@/types/errors.types';
import { Decimal } from '@prisma/client/runtime/library';
import { env } from '@/config/env';

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
      const requiredAmount = BigInt(Math.floor(datapod.priceSui.toNumber() * 1e9)) + BigInt(10000000);

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

    // Build and execute PTB transaction for purchase
    let txDigest: string;
    let purchaseRequestId: string;
    let escrowId: string;
    const sellerAddress = seller.zkloginAddress || seller.walletAddress;

    try {
      if (!sellerAddress) {
        throw new ValidationError('Seller address not found (neither zkLogin nor wallet)');
      }
      // Build PTB for creating purchase request and escrow
      const purchaseTx = BlockchainService.buildPurchasePTB(
        {
          datapodId: datapod_id,
          buyer: buyer_address,
          seller: sellerAddress,
          price: Math.floor(datapod.priceSui.toNumber() * 1e9),
          buyerPublicKey: buyer_public_key,
          dataHash: datapod.dataHash,
        },
        env.SUI_SPONSOR_ADDRESS,
      );

      // Execute transaction with sponsored gas
      txDigest = await BlockchainService.executeTransaction(purchaseTx);

      // Wait for transaction confirmation
      await BlockchainService.waitForTransaction(txDigest);

      // Generate deterministic IDs based on transaction digest
      purchaseRequestId = `0x${txDigest.slice(2, 66)}`;
      escrowId = `0x${randomUUID().replace(/-/g, '').slice(0, 64)}`;

      logger.info('Purchase transaction executed', {
        requestId: req.requestId,
        txDigest,
        purchaseRequestId,
        escrowId,
      });
    } catch (blockchainError) {
      logger.error('Failed to execute purchase transaction', {
        error: blockchainError,
        requestId: req.requestId,
      });
      throw new BlockchainError('Failed to execute purchase transaction');
    }

    // Get buyer details
    const buyer = await prisma.user.findFirst({
      where: {
        OR: [
          { zkloginAddress: req.user!.address },
          { walletAddress: req.user!.address },
        ],
      },
    });

    if (!buyer) {
      throw new ValidationError('Buyer not found');
    }

    // Record in database
    const purchaseRequest = await prisma.purchaseRequest.create({
      data: {
        purchaseRequestId,
        datapodId: datapod.id,
        buyerId: buyer.id,
        buyerAddress: buyer_address,
        sellerAddress: sellerAddress || '',
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
      seller.id,
      sellerAddress || '',
    );

    // Store transaction audit
    await prisma.transactionAudit.create({
      data: {
        txDigest,
        txType: 'purchase_request',
        userAddress: req.user!.address,
        datapodId: datapod.id,
        data: { purchaseRequestId, escrowId },
      },
    });

    logger.info('Purchase created', {
      requestId: req.requestId,
      purchaseRequestId,
      escrowId: escrow.escrowId,
    });

    // Queue fulfillment job
    try {
      await queueFulfillmentJob({
        purchase_id: purchaseRequest.id,
        datapod_id: datapod.id,
        seller_address: sellerAddress || '',
        buyer_address: buyer_address,
        buyer_public_key: buyer_public_key,
        price_sui: datapod.priceSui.toNumber(),
      });
    } catch (queueError) {
      logger.warn('Failed to queue fulfillment job', { error: queueError });
    }

    // Emit WebSocket event
    try {
      const { broadcaster } = await import('@/main');
      if (broadcaster) {
        await broadcaster.broadcastEvent({
          type: 'purchase.created',
          data: {
            purchase_id: purchaseRequestId,
            datapod_id: datapod_id,
            buyer_address: buyer_address,
            seller_address: sellerAddress,
            price_sui: datapod.priceSui.toNumber(),
          },
          timestamp: Math.floor(Date.now() / 1000),
          eventId: randomUUID(),
          blockHeight: 0,
        });
      }
    } catch (wsError) {
      logger.warn('Failed to emit WebSocket event', { error: wsError });
    }

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
 * Get download URL for purchased data
 */
export const getDownloadUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_id } = req.params;

    if (!purchase_id) {
      throw new ValidationError('Missing purchase_id');
    }

    const purchase = await prisma.purchaseRequest.findUnique({
      where: { purchaseRequestId: purchase_id },
      include: { datapod: true },
    });

    if (!purchase) {
      throw new ValidationError('Purchase not found');
    }

    if (purchase.buyerAddress !== req.user!.address) {
      throw new ValidationError('Unauthorized: buyer does not own this purchase');
    }

    if (purchase.status !== 'completed') {
      throw new ValidationError(`Purchase status is ${purchase.status}, expected completed`);
    }

    // Check rate limit
    const rateLimitKey = `download:rate:${purchase_id}:${req.user!.address}`;
    const downloadCount = await CacheService.getCachedData<number>(rateLimitKey);

    if (downloadCount && downloadCount >= 10) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Download rate limit exceeded (10 per hour)',
          statusCode: 429,
          requestId: req.requestId,
        },
      });
      return;
    }

    if (!purchase.encryptedBlobId) {
      throw new ValidationError('Encrypted blob not found for this purchase');
    }

    const walrusUrl = `https://api.testnet.walrus.io/blobs/${purchase.encryptedBlobId}`;

    const newCount = (downloadCount || 0) + 1;
    await CacheService.setCachedData(rateLimitKey, newCount, 3600);

    // Log download for audit
    await prisma.transactionAudit.create({
      data: {
        txType: 'download',
        userAddress: req.user!.address,
        userId: purchase.buyerId,
        datapodId: purchase.datapodId,
        data: {
          purchaseId: purchase_id,
          blobId: purchase.encryptedBlobId,
          downloadCount: newCount,
        },
      },
    });

    logger.info('Download URL generated', {
      requestId: req.requestId,
      purchaseId: purchase_id,
      blobId: purchase.encryptedBlobId,
    });

    res.status(200).json({
      status: 'success',
      blob_id: purchase.encryptedBlobId,
      walrus_url: walrusUrl,
      data_hash: purchase.datapod?.dataHash,
      decryption_key: purchase.decryptionKey,
      download_count: newCount,
    });
  } catch (error) {
    logger.error('Get download URL failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Download purchased data endpoint
 */
export const downloadData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_id } = req.params;
    const { buyer_private_key } = req.body;

    if (!purchase_id) {
      throw new ValidationError('Missing purchase_id');
    }

    if (!buyer_private_key) {
      throw new ValidationError('Missing buyer_private_key for decryption');
    }

    const purchaseRequest = await prisma.purchaseRequest.findUnique({
      where: { purchaseRequestId: purchase_id },
      include: { datapod: true },
    });

    if (!purchaseRequest) {
      throw new ValidationError('Purchase request not found');
    }

    if (purchaseRequest.status !== 'completed') {
      throw new ValidationError(`Purchase status is ${purchaseRequest.status}, expected completed`);
    }

    if (purchaseRequest.buyerAddress !== req.user!.address) {
      throw new ValidationError('Unauthorized: buyer does not own this purchase');
    }

    logger.info('Downloading data', {
      requestId: req.requestId,
      purchaseRequestId: purchase_id,
    });

    if (!purchaseRequest.encryptedBlobId) {
      throw new ValidationError('Encrypted blob not found for this purchase');
    }

    const encryptedData = await StorageService.downloadFromWalrus(purchaseRequest.encryptedBlobId);

    const decryptedData = await EncryptionService.hybridDecrypt(
      purchaseRequest.decryptionKey || '',
      encryptedData.toString('base64'),
      '',
      '',
      buyer_private_key,
    );

    // Verify data integrity by checking hash
    const decryptedHash = EncryptionService.hashFile(decryptedData);
    if (decryptedHash !== purchaseRequest.datapod?.dataHash) {
      throw new ValidationError(
        `Data integrity check failed. Expected hash: ${purchaseRequest.datapod?.dataHash}, got: ${decryptedHash}`,
      );
    }

    logger.info('Data decrypted and verified successfully', {
      requestId: req.requestId,
      purchaseRequestId: purchase_id,
      dataHash: decryptedHash,
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${purchaseRequest.datapod?.title || 'data'}.bin"`,
    );
    res.setHeader('X-Data-Hash', purchaseRequest.datapod?.dataHash || '');
    res.send(decryptedData);
  } catch (error) {
    logger.error('Download failed', {
      error,
      requestId: req.requestId,
      message: error instanceof ValidationError ? 'Data integrity verification failed' : 'Download error',
    });
    throw error;
  }
};

/**
 * Get buyer purchases with pagination and filtering
 */
export const getBuyerPurchases = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, status } = req.query as any;

    // Validate and clamp pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build filters
    const where: any = {
      buyerAddress: req.user!.address,
    };

    if (status && ['completed', 'pending', 'failed', 'refunded'].includes(status)) {
      where.status = status;
    }

    logger.info('Fetching buyer purchases', {
      requestId: req.requestId,
      buyerAddress: req.user!.address,
      page: pageNum,
      limit: limitNum,
      status,
    });

    // Query database with pagination
    const [purchases, total] = await Promise.all([
      prisma.purchaseRequest.findMany({
        where,
        include: {
          datapod: {
            select: {
              datapodId: true,
              title: true,
              category: true,
              priceSui: true,
              sellerId: true,
            },
          },
          review: {
            select: {
              id: true,
              rating: true,
              comment: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.purchaseRequest.count({ where }),
    ]);

    // Get seller information for each purchase
    const purchasesWithSeller = await Promise.all(
      purchases.map(async (purchase) => {
        let sellerInfo = null;

        if (purchase.datapod?.sellerId) {
          const seller = await prisma.user.findUnique({
            where: { id: purchase.datapod.sellerId },
            select: {
              id: true,
              zkloginAddress: true,
              walletAddress: true,
              username: true,
            },
          });

          if (seller) {
            sellerInfo = {
              address: seller.zkloginAddress || seller.walletAddress || '',
              username: seller.username || 'Anonymous',
            };
          }
        }

        return {
          id: purchase.id,
          dataPod: purchase.datapod
            ? {
              datapodId: purchase.datapod.datapodId,
              title: purchase.datapod.title,
              category: purchase.datapod.category,
            }
            : null,
          seller: sellerInfo,
          priceSui: purchase.priceSui.toNumber(),
          status: purchase.status,
          createdAt: purchase.createdAt.toISOString(),
          review: purchase.review
            ? {
              rating: purchase.review.rating,
            }
            : undefined,
        };
      }),
    );

    res.status(200).json({
      status: 'success',
      data: {
        purchases: purchasesWithSeller,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    logger.error('Get buyer purchases failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Submit review for purchase
 */
export const submitReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_id } = req.params;
    const { rating, comment } = req.body;

    if (!purchase_id) {
      throw new ValidationError('Missing purchase_id');
    }

    if (!rating || rating < 1 || rating > 5) {
      throw new ValidationError('Rating must be between 1 and 5');
    }

    if (!comment || comment.trim().length === 0) {
      throw new ValidationError('Comment is required');
    }

    // Get purchase request
    const purchase = await prisma.purchaseRequest.findUnique({
      where: { purchaseRequestId: purchase_id },
      include: {
        datapod: true,
      },
    });

    if (!purchase) {
      throw new ValidationError('Purchase not found');
    }

    // Verify ownership
    if (purchase.buyerAddress !== req.user!.address) {
      throw new ValidationError('Unauthorized: you do not own this purchase');
    }

    // Verify purchase is completed
    if (purchase.status !== 'completed') {
      throw new ValidationError(`Cannot review purchase with status: ${purchase.status}`);
    }

    // Check if review already exists
    const existingReview = await prisma.review.findFirst({
      where: {
        purchaseRequestId: purchase_id,
      },
    });

    if (existingReview) {
      throw new ValidationError('Review already exists for this purchase');
    }

    logger.info('Creating review', {
      requestId: req.requestId,
      purchaseId: purchase_id,
      rating,
      datapodId: purchase.datapodId,
    });

    // Create review
    const review = await prisma.review.create({
      data: {
        purchaseRequestId: purchase_id,
        datapodId: purchase.datapodId,
        buyerId: purchase.buyerId,
        buyerAddress: purchase.buyerAddress,
        rating,
        comment: comment.trim(),
      },
    });

    // Update datapod average rating
    const reviews = await prisma.review.findMany({
      where: { datapodId: purchase.datapodId },
      select: { rating: true },
    });

    const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    await prisma.dataPod.update({
      where: { id: purchase.datapodId },
      data: {
        averageRating: new Decimal(averageRating),
      },
    });

    // Invalidate cache
    await CacheService.invalidateDataPodCache(purchase.datapod!.datapodId);

    logger.info('Review created successfully', {
      requestId: req.requestId,
      reviewId: review.id,
      averageRating,
    });

    res.status(200).json({
      status: 'success',
      data: {
        review: {
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt.toISOString(),
        },
        datapod: {
          averageRating,
          totalReviews: reviews.length,
        },
      },
    });
  } catch (error) {
    logger.error('Submit review failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Get purchase status with caching
 */
export const getPurchaseStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_id } = req.params;

    if (!purchase_id) {
      throw new ValidationError('Missing purchase_id');
    }

    const cacheKey = `purchase:status:${purchase_id}`;
    const cached = await CacheService.getCachedData(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    const purchase = await prisma.purchaseRequest.findUnique({
      where: { purchaseRequestId: purchase_id },
      include: {
        datapod: {
          select: {
            id: true,
            datapodId: true,
            title: true,
            blobId: true,
          },
        },
      },
    });

    if (!purchase) {
      throw new ValidationError('Purchase not found');
    }

    if (purchase.buyerAddress !== req.user!.address) {
      throw new ValidationError('Unauthorized: buyer does not own this purchase');
    }

    const response = {
      status: 'success',
      purchase_request_id: purchase.purchaseRequestId,
      purchase_status: purchase.status,
      blob_id: purchase.encryptedBlobId || purchase.datapod?.blobId,
      datapod_id: purchase.datapod?.datapodId,
      datapod_title: purchase.datapod?.title,
      price_sui: purchase.priceSui.toNumber(),
      created_at: purchase.createdAt.toISOString(),
      completed_at: purchase.completedAt?.toISOString() || null,
    };

    await CacheService.setCachedData(cacheKey, response, 300);

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get purchase status failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Get purchase details
 */
export const getPurchaseDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_id } = req.params;

    const purchase = await prisma.purchaseRequest.findUnique({
      where: { purchaseRequestId: purchase_id },
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