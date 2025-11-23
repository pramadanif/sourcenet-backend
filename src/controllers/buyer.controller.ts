
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BlockchainService } from '@/services/blockchain.service';
import { EncryptionService } from '@/services/encryption.service';
import { PaymentService } from '@/services/payment.service';
import { CacheService } from '@/services/cache.service';
import { ValidationError, NotFoundError, BlockchainError } from '@/types/errors.types';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { randomUUID } from 'crypto';
import { queueFulfillmentJob } from '@/jobs/fulfillment.job';
import { WalrusService } from '@/services/walrus.service';

const prisma = new PrismaClient();

/**
 * Get all purchases for the authenticated buyer
 */
export const getBuyerPurchases = async (req: Request, res: Response): Promise<void> => {
  try {
    const buyerAddress = req.user!.address;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [purchases, total] = await Promise.all([
      prisma.purchaseRequest.findMany({
        where: { buyerAddress },
        include: {
          datapod: {
            select: {
              id: true,
              datapodId: true,
              title: true,
              priceSui: true,
              category: true,
              seller: {
                select: {
                  username: true,
                  walletAddress: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchaseRequest.count({ where: { buyerAddress } }),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        purchases,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Get buyer purchases failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Initiate a purchase (Step 1 of 2-step flow)
 * Buyer requests to purchase a DataPod
 */
export const initiatePurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datapod_id } = req.body;
    const buyer_address = req.user!.address;

    if (!datapod_id) {
      throw new ValidationError('Missing datapod_id');
    }

    // 1. Verify DataPod
    const datapod = await prisma.dataPod.findUnique({
      where: { datapodId: datapod_id },
    });

    if (!datapod) {
      throw new NotFoundError('DataPod not found');
    }

    if (datapod.status !== 'published') {
      throw new ValidationError('DataPod is not available for purchase');
    }

    // 2. Verify Seller
    const seller = await prisma.user.findUnique({
      where: { id: datapod.sellerId },
    });

    if (!seller) {
      throw new ValidationError('Seller not found');
    }

    const sellerAddress = seller.zkloginAddress || seller.walletAddress;
    if (!sellerAddress) {
      throw new ValidationError('Seller address not found');
    }

    // 3. Generate Ephemeral Keypair for Buyer
    // This keypair will be used to encrypt the data for the buyer
    const keypair = EncryptionService.generateKeyPair();
    const buyer_public_key = keypair.publicKey;
    const buyer_private_key = keypair.privateKey;

    // 4. Create Purchase Request Record
    const purchaseRequestId = randomUUID();

    // We don't create the blockchain object yet, that happens in the second step
    // or we can create it here if we want to lock the price?
    // For the 2-step flow, the buyer signs the transaction in the frontend.

    // Return the details needed for the frontend to build the transaction
    res.status(200).json({
      status: 'success',
      data: {
        purchase_request_id: purchaseRequestId,
        datapod: {
          id: datapod.id,
          datapod_id: datapod.datapodId,
          title: datapod.title,
          price_sui: datapod.priceSui.toNumber(),
          data_hash: datapod.dataHash,
        },
        seller: {
          address: sellerAddress,
        },
        buyer: {
          address: buyer_address,
          public_key: buyer_public_key,
          private_key: buyer_private_key, // IMPORTANT: Return this to the client!
        },
        sponsor: {
          address: env.SUI_SPONSOR_ADDRESS,
        },
      },
    });

  } catch (error) {
    logger.error('Initiate purchase failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Execute Purchase (Step 2 of 2-step flow)
 * Frontend sends the signed transaction digest
 */
export const executePurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_request_id, tx_digest, buyer_public_key } = req.body;
    const buyer_address = req.user!.address;

    if (!purchase_request_id || !tx_digest || !buyer_public_key) {
      throw new ValidationError('Missing required fields');
    }

    // 1. Verify Transaction on Blockchain
    const txDetails = await BlockchainService.waitForTransaction(tx_digest);

    if (txDetails.effects?.status.status !== 'success') {
      throw new ValidationError('Transaction failed on blockchain');
    }

    // 2. Extract On-Chain IDs
    let purchaseRequestId = '';
    let escrowId = '';
    let escrowObjectId = '';

    if (txDetails.objectChanges) {
      const createdPurchase = txDetails.objectChanges.find(
        (change: any) =>
          change.type === 'created' &&
          change.objectType.endsWith('::purchase::PurchaseRequest')
      );

      if (createdPurchase && 'objectId' in createdPurchase) {
        purchaseRequestId = createdPurchase.objectId;
      }

      const createdEscrow = txDetails.objectChanges.find(
        (change: any) =>
          change.type === 'created' &&
          change.objectType.endsWith('::escrow::Escrow')
      );

      if (createdEscrow && 'objectId' in createdEscrow) {
        escrowObjectId = createdEscrow.objectId;
      }
    }

    if (!purchaseRequestId || !escrowObjectId) {
      throw new ValidationError('Failed to find created objects in transaction');
    }

    // 3. Get DataPod details from the purchase request ID (passed in body is UUID, on-chain is object ID)
    // We need to find which datapod was purchased.
    // In a real implementation, we might parse the transaction inputs or events.
    // For the purpose of this flow, we assume the frontend passes the datapod_id too, or we look it up.
    // Let's require datapod_id in body for simplicity
    const { datapod_id } = req.body;
    if (!datapod_id) throw new ValidationError('Missing datapod_id');

    const datapod = await prisma.dataPod.findUnique({
      where: { datapodId: datapod_id },
    });

    if (!datapod) throw new NotFoundError('DataPod not found');

    const seller = await prisma.user.findUnique({ where: { id: datapod.sellerId } });
    if (!seller) throw new ValidationError('Seller not found');
    const sellerAddress = seller.zkloginAddress || seller.walletAddress;

    // 4. Record in Database
    const buyer = await prisma.user.findFirst({
      where: {
        OR: [
          { zkloginAddress: buyer_address },
          { walletAddress: buyer_address },
        ],
      },
    });

    if (!buyer) throw new ValidationError('Buyer not found');

    const purchaseRequest = await prisma.purchaseRequest.create({
      data: {
        purchaseRequestId: purchaseRequestId, // Use on-chain ID
        datapodId: datapod.id,
        buyerId: buyer.id,
        buyerAddress: buyer_address,
        sellerAddress: sellerAddress || '',
        buyerPublicKey: buyer_public_key,
        priceSui: datapod.priceSui,
        status: 'pending',
        txDigest: tx_digest,
      },
    });

    // 5. Create Escrow Record
    const escrow = await PaymentService.createEscrow(
      purchaseRequest.id,
      datapod.priceSui.toNumber(),
      buyer_address,
      seller.id,
      sellerAddress || '',
      escrowObjectId,
    );

    // 6. Queue Fulfillment
    await queueFulfillmentJob({
      purchase_id: purchaseRequest.id,
      datapod_id: datapod.id,
      seller_address: sellerAddress || '',
      buyer_address: buyer_address,
      buyer_public_key: buyer_public_key,
      price_sui: datapod.priceSui.toNumber(),
    });

    res.status(200).json({
      status: 'success',
      data: {
        purchase_id: purchaseRequest.id,
        status: 'pending',
      },
    });

  } catch (error) {
    logger.error('Execute purchase failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Submit a review for a purchased DataPod
 */
export const submitReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_id, rating, comment } = req.body;
    const buyerAddress = req.user!.address;

    if (!purchase_id || !rating) {
      throw new ValidationError('Missing required fields');
    }

    if (rating < 1 || rating > 5) {
      throw new ValidationError('Rating must be between 1 and 5');
    }

    // Verify purchase
    const purchase = await prisma.purchaseRequest.findUnique({
      where: { purchaseRequestId: purchase_id },
      include: { datapod: true },
    });

    if (!purchase) {
      throw new NotFoundError('Purchase not found');
    }

    if (purchase.buyerAddress !== buyerAddress) {
      throw new ValidationError('Unauthorized: buyer does not own this purchase');
    }

    if (purchase.status !== 'completed') {
      throw new ValidationError('Purchase must be completed before reviewing');
    }

    // Check if review already exists
    const existingReview = await prisma.review.findFirst({
      where: {
        purchaseRequestId: purchase.id,
      },
    });

    if (existingReview) {
      throw new ValidationError('Review already exists for this purchase');
    }

    // Create review
    const review = await prisma.review.create({
      data: {
        datapodId: purchase.datapodId,
        buyerId: purchase.buyerId,
        purchaseRequestId: purchase.id,
        buyerAddress: buyerAddress,
        rating,
        comment,
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
      throw new NotFoundError('Purchase not found');
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
      throw new NotFoundError('Purchase not found');
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

export const createPurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datapod_id, payment_tx_digest } = req.body;

    logger.info('Received capture purchase request', {
      datapod_id,
      payment_tx_digest,
      body: req.body
    });

    if (!datapod_id || !payment_tx_digest) {
      throw new ValidationError('Missing required fields: datapod_id, payment_tx_digest');
    }

    // 1. Verify DataPod exists and is available
    const datapod = await prisma.dataPod.findUnique({
      where: { datapodId: datapod_id },
    });

    if (!datapod) {
      throw new NotFoundError('DataPod not found');
    }

    if (datapod.status !== 'published') {
      throw new ValidationError(`DataPod status is ${datapod.status}, expected published`);
    }

    // 2. Verify Seller exists
    const seller = await prisma.user.findUnique({
      where: { id: datapod.sellerId },
    });

    if (!seller) {
      throw new ValidationError('Seller not found');
    }

    const sellerAddress = seller.zkloginAddress || seller.walletAddress;
    if (!sellerAddress) {
      throw new ValidationError('Seller address not found');
    }

    // 3. Verify Buyer (Authenticated User)
    const buyerAddress = req.user!.address;
    const buyer = await prisma.user.findFirst({
      where: {
        OR: [
          { zkloginAddress: buyerAddress },
          { walletAddress: buyerAddress },
        ],
      },
    });

    if (!buyer) {
      throw new ValidationError('Buyer not found');
    }

    // 4. Idempotency Check: Check if this payment digest was already used
    const existingPurchase = await prisma.purchaseRequest.findFirst({
      where: {
        txDigest: payment_tx_digest, // We can store the payment digest here or in a separate field/table
      },
    });

    if (existingPurchase) {
      throw new ValidationError('Payment transaction already used for a purchase');
    }

    // 5. Verify Payment Transaction
    const priceSui = Math.floor(datapod.priceSui.toNumber() * 1e9);

    try {
      await BlockchainService.verifyPaymentTransaction(
        payment_tx_digest,
        priceSui,
        buyerAddress,
        env.SUI_SPONSOR_ADDRESS
      );
    } catch (error: any) {
      throw new ValidationError(`Invalid payment transaction: ${error.message}`);
    }

    logger.info('Payment verified, proceeding with purchase capture', {
      requestId: req.requestId,
      datapodId: datapod_id,
      buyerAddress,
      paymentDigest: payment_tx_digest
    });

    // 6. Generate Ephemeral Keypair for Buyer
    const keypair = EncryptionService.generateKeyPair();
    const buyerPublicKey = keypair.publicKey;
    const buyerPrivateKey = keypair.privateKey;

    // 7. Build and Execute Purchase Transaction (Sponsored)
    // The Sponsor pays for the gas and the purchase creation/escrow funding
    // using the SUI they just received from the buyer.

    let purchaseTxDigest: string;
    let purchaseRequestId = randomUUID();
    let escrowId: string;
    let escrowObjectId: string | null = null;

    try {
      const purchaseTx = BlockchainService.buildPurchasePTB(
        {
          datapodId: datapod_id,
          buyer: buyerAddress,
          seller: sellerAddress,
          price: priceSui,
          buyerPublicKey: buyerPublicKey,
          dataHash: datapod.dataHash,
          purchaseId: purchaseRequestId,
        },
        env.SUI_SPONSOR_ADDRESS
      );

      // Execute transaction with sponsored gas
      purchaseTxDigest = await BlockchainService.executeTransaction(purchaseTx);

      // Wait for transaction confirmation
      const txDetails = await BlockchainService.waitForTransaction(purchaseTxDigest);

      // Find object IDs from transaction effects
      if (txDetails.objectChanges) {
        const createdObject = txDetails.objectChanges.find(
          (change: any) =>
            change.type === 'created' &&
            change.objectType.endsWith('::purchase::PurchaseRequest')
        );

        if (createdObject && 'objectId' in createdObject) {
          purchaseRequestId = createdObject.objectId;
        }

        const escrowObject = txDetails.objectChanges.find(
          (change: any) =>
            change.type === 'created' &&
            change.objectType.endsWith('::escrow::Escrow')
        );

        if (escrowObject && 'objectId' in escrowObject) {
          escrowObjectId = escrowObject.objectId;
        }
      }

      escrowId = `0x${randomUUID().replace(/-/g, '').slice(0, 64)}`;

    } catch (blockchainError) {
      logger.error('Failed to execute capture purchase transaction', {
        error: blockchainError,
        requestId: req.requestId,
      });
      throw new BlockchainError('Failed to execute purchase transaction');
    }

    // 8. Record in Database
    // We store the purchaseTxDigest as the main digest, but we should probably log the payment digest too
    const purchaseRequest = await prisma.purchaseRequest.create({
      data: {
        purchaseRequestId,
        datapodId: datapod.id,
        buyerId: buyer.id,
        buyerAddress: buyerAddress,
        sellerAddress: sellerAddress,
        buyerPublicKey: buyerPublicKey,
        priceSui: datapod.priceSui,
        status: 'pending',
        txDigest: purchaseTxDigest,
      },
    });

    // Create escrow record
    const escrow = await PaymentService.createEscrow(
      purchaseRequest.id,
      datapod.priceSui.toNumber(),
      buyerAddress,
      seller.id,
      sellerAddress,
      escrowObjectId,
    );

    // Store transaction audit including payment digest
    await prisma.transactionAudit.create({
      data: {
        txDigest: purchaseTxDigest,
        txType: 'purchase_capture',
        userAddress: req.user!.address,
        datapodId: datapod.id,
        data: {
          purchaseRequestId,
          escrowId,
          paymentTxDigest: payment_tx_digest
        },
      },
    });

    // 9. Queue Fulfillment Job
    try {
      await queueFulfillmentJob({
        purchase_id: purchaseRequest.id,
        datapod_id: datapod.id,
        seller_address: sellerAddress,
        buyer_address: buyerAddress,
        buyer_public_key: buyerPublicKey,
        price_sui: datapod.priceSui.toNumber(),
      });
    } catch (queueError) {
      logger.warn('Failed to queue fulfillment job', { error: queueError });
    }

    // 10. Return Response with Private Key
    res.status(200).json({
      status: 'success',
      purchase_request_id: purchaseRequestId,
      escrow_status: 'active',
      tx_digest: purchaseTxDigest,
      payment_tx_digest: payment_tx_digest,
      private_key: buyerPrivateKey, // IMPORTANT: Return private key to user
      message: 'Purchase captured successfully. SAVE THE PRIVATE KEY!',
    });

  } catch (error) {
    logger.error('Capture purchase failed', { error, requestId: req.requestId });
    throw error;
  }
};

export const getDownloadUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_id } = req.params;
    const buyerAddress = req.user!.address;

    if (!purchase_id) {
      throw new ValidationError('Missing purchase_id');
    }

    // 1. Verify Purchase
    const purchase = await prisma.purchaseRequest.findUnique({
      where: { purchaseRequestId: purchase_id },
      include: {
        datapod: {
          include: {
            uploadStaging: true,
          },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundError('Purchase not found');
    }

    if (purchase.buyerAddress !== buyerAddress) {
      throw new ValidationError('Unauthorized: buyer does not own this purchase');
    }

    if (purchase.status !== 'completed') {
      throw new ValidationError('Purchase not completed');
    }

    if (!purchase.encryptedBlobId) {
      throw new NotFoundError('Encrypted data not found for this purchase');
    }

    // 2. Generate URLs
    const directUrl = WalrusService.getBlobUrl(purchase.encryptedBlobId);
    const proxyUrl = `${env.API_BASE_URL}/api/buyer/download/${purchase_id}`;

    // 3. Get file metadata from upload staging
    const uploadStaging = purchase.datapod.uploadStaging;

    const metadata = uploadStaging?.metadata as any;
    const fileMetadata = {
      title: purchase.datapod.title,
      mimeType: metadata?.mimeType || 'application/octet-stream',
      originalName: metadata?.originalName || `${purchase.datapod.title}.bin`,
      fileSize: metadata?.fileSize || 0,
    };

    logger.info('Generated download URLs', {
      requestId: req.requestId,
      purchaseId: purchase_id,
      blobId: purchase.encryptedBlobId,
      fileMetadata,
    });

    res.status(200).json({
      status: 'success',
      data: {
        direct_url: directUrl,
        proxy_url: proxyUrl,
        blob_id: purchase.encryptedBlobId,
        decryption_key: purchase.decryptionKey,
        file_metadata: fileMetadata,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour validity (mock)
      },
    });

  } catch (error) {
    logger.error('Get download URL failed', { error, requestId: req.requestId });
    throw error;
  }
};

export const downloadData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchase_id } = req.params;
    const buyerAddress = req.user!.address;

    if (!purchase_id) {
      throw new ValidationError('Missing purchase_id');
    }

    // 1. Verify Purchase
    const purchase = await prisma.purchaseRequest.findUnique({
      where: { purchaseRequestId: purchase_id },
      include: { datapod: true },
    });

    if (!purchase) {
      throw new NotFoundError('Purchase not found');
    }

    if (purchase.buyerAddress !== buyerAddress) {
      throw new ValidationError('Unauthorized: buyer does not own this purchase');
    }

    if (purchase.status !== 'completed') {
      throw new ValidationError('Purchase not completed');
    }

    if (!purchase.encryptedBlobId) {
      throw new NotFoundError('Encrypted data not found for this purchase');
    }

    // 2. Fetch Blob from Walrus
    logger.info('Proxying download from Walrus', {
      requestId: req.requestId,
      purchaseId: purchase_id,
      blobId: purchase.encryptedBlobId
    });

    const buffer = await WalrusService.getBlob(purchase.encryptedBlobId);

    // 3. Stream to Client
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${purchase.datapod.title}.enc"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

  } catch (error) {
    logger.error('Download data failed', { error, requestId: req.requestId });
    throw error;
  }
};
