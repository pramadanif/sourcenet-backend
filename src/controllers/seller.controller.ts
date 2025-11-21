import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import prisma from '@/config/database';
import { logger } from '@/utils/logger';
import { EncryptionService } from '@/services/encryption.service';
import { StorageService } from '@/services/storage.service';
import { BlockchainService } from '@/services/blockchain.service';
import { CacheService } from '@/services/cache.service';
import { ValidationError, BlockchainError } from '@/types/errors.types';
import { Decimal } from '@prisma/client/runtime/library';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Upload data endpoint
 */
export const uploadData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { metadata, message, signature } = req.body;
    const file = req.file;

    if (!file) {
      throw new ValidationError('No file provided');
    }

    // Verify file size
    if (file.size > MAX_FILE_SIZE) {
      throw new ValidationError(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    // Parse and validate metadata
    let parsedMetadata: any;
    try {
      parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    } catch (error) {
      throw new ValidationError('Invalid metadata JSON');
    }

    if (!parsedMetadata.title || !parsedMetadata.category || !parsedMetadata.price_sui) {
      throw new ValidationError('Missing required metadata fields: title, category, price_sui');
    }

    // Generate data hash
    const dataHash = EncryptionService.hashFile(file.buffer);

    logger.info('File uploaded', {
      requestId: req.requestId,
      fileName: file.originalname,
      fileSize: file.size,
      dataHash,
    });

    // Generate encryption key and encrypt file
    const encryptionKey = EncryptionService.generateEncryptionKey();
    const encryptedData = EncryptionService.encryptFileSimple(file.buffer, encryptionKey);

    // Upload to Walrus storage
    const uploadedFile = await StorageService.uploadToWalrus(
      {
        buffer: encryptedData,
        originalname: `${randomUUID()}.enc`,
      },
      'uploads',
    );

    logger.info('File uploaded to Walrus', {
      requestId: req.requestId,
      cid: uploadedFile.cid,
    });

    // Extract preview data (first 100 records if JSON)
    let previewData = '';
    try {
      const content = file.buffer.toString('utf-8');
      const lines = content.split('\n').slice(0, 100);
      previewData = lines.join('\n');
    } catch {
      previewData = 'Binary data - preview not available';
    }

    // Store in database
    const uploadId = randomUUID();
    const seller = await prisma.user.findFirst({
      where: {
        OR: [
          { zkloginAddress: req.user!.address },
          { walletAddress: req.user!.address },
        ],
      },
    });

    if (!seller) {
      throw new ValidationError('Seller not found');
    }

    // Check for existing upload with same data_hash
    const existingUpload = await prisma.uploadStaging.findUnique({
      where: { dataHash },
    });

    if (existingUpload) {
      logger.info('Upload with same data hash already exists', {
        requestId: req.requestId,
        existingUploadId: existingUpload.id,
        dataHash,
      });

      // If it exists and is already published, reject with appropriate message
      if (existingUpload.status === 'published') {
        throw new ValidationError(
          'A DataPod with this content already exists in the marketplace. Upload unique content.'
        );
      }

      // If pending/expired, return the existing upload
      res.status(200).json({
        status: 'success',
        upload_id: existingUpload.id,
        data_hash: dataHash,
        preview_data: previewData.substring(0, 500),
        file_size: file.size,
        message: 'File matches existing upload. Using existing staging record.',
        warning: 'This content is already in your uploads',
      });
      return;
    }

    const uploadStaging = await prisma.uploadStaging.create({
      data: {
        sellerId: seller.id,
        datapodId: null, // Will be set after publishing
        filePath: uploadedFile.cid, // Store blob ID, not URL
        dataHash,
        metadata: {
          ...parsedMetadata,
          encryptionKey: encryptionKey.toString('base64'), // Store key for fulfillment job
          blobId: uploadedFile.cid, // Also store in metadata for clarity
          walrusUrl: uploadedFile.url, // Keep URL for reference
        },
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    logger.info('Upload staging created', {
      requestId: req.requestId,
      uploadId: uploadStaging.id,
      dataHash,
    });

    res.status(200).json({
      status: 'success',
      upload_id: uploadStaging.id,
      data_hash: dataHash,
      preview_data: previewData.substring(0, 500), // First 500 chars
      file_size: file.size,
      message: 'File uploaded successfully. Ready to publish.',
    });
  } catch (error) {
    logger.error('Upload failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Publish DataPod endpoint
 */
export const publishDataPod = async (req: Request, res: Response): Promise<void> => {
  try {
    const { upload_id } = req.body;

    if (!upload_id) {
      throw new ValidationError('Missing upload_id');
    }

    // Verify upload exists and is pending
    const uploadStaging = await prisma.uploadStaging.findUnique({
      where: { id: upload_id },
    });

    if (!uploadStaging) {
      throw new ValidationError('Upload not found');
    }

    if (uploadStaging.status !== 'pending') {
      throw new ValidationError(`Upload status is ${uploadStaging.status}, expected pending`);
    }

    // Verify seller owns this upload
    const seller = await prisma.user.findFirst({
      where: {
        OR: [
          { zkloginAddress: req.user!.address },
          { walletAddress: req.user!.address },
        ],
      },
    });

    if (!seller || uploadStaging.sellerId !== seller.id) {
      throw new ValidationError('Unauthorized: seller does not own this upload');
    }

    const metadata = uploadStaging.metadata as any;

    logger.info('Publishing DataPod', {
      requestId: req.requestId,
      uploadId: upload_id,
      title: metadata.title,
    });

    // Build and execute PTB transaction
    let txDigest: string;
    let datapodId: string;
    let kioskId: string;
    const sellerAddress = seller.zkloginAddress || seller.walletAddress;

    try {
      if (!sellerAddress) {
        throw new ValidationError('Seller address not found (neither zkLogin nor wallet)');
      }

      // Get seller's Kiosk
      const kioskData = await BlockchainService.getOrCreateSellerKiosk(sellerAddress);

      const priceInMist = BigInt(Math.floor(Number(metadata.price_sui) * 1e9));
      logger.info('Building Publish PTB', {
        priceSui: metadata.price_sui,
        priceMist: priceInMist.toString(),
        typeOfPriceSui: typeof metadata.price_sui
      });

      // Build PTB for publishing DataPod
      const publishTx = BlockchainService.buildPublishPTB(
        {
          title: metadata.title,
          category: metadata.category,
          description: metadata.description || '',
          price: priceInMist, // Convert to MIST (BigInt)
          dataHash: uploadStaging.dataHash,
          blobId: uploadStaging.filePath, // Now contains blob ID directly
          uploadId: upload_id,
          sellerAddress: sellerAddress,
        },
        sellerAddress,
        kioskData,
      );

      // Execute transaction with sponsored gas
      txDigest = await BlockchainService.executeTransaction(publishTx);

      // Wait for transaction confirmation
      const txResult = await BlockchainService.waitForTransaction(txDigest);

      // Extract on-chain IDs from transaction result
      // For now, generate deterministic IDs based on upload_id
      datapodId = `0x${uploadStaging.dataHash.slice(0, 64)}`;
      kioskId = `0x${randomUUID().replace(/-/g, '').slice(0, 64)}`;

      logger.info('DataPod published on blockchain', {
        requestId: req.requestId,
        txDigest,
        datapodId,
        kioskId,
      });
    } catch (blockchainError) {
      logger.error('Failed to publish DataPod on blockchain', {
        error: blockchainError,
        requestId: req.requestId,
      });
      throw new BlockchainError('Failed to publish DataPod on blockchain');
    }

    // Create DataPod record with blockchain transaction digest
    const datapod = await prisma.dataPod.create({
      data: {
        datapodId,
        sellerId: seller.id,
        title: metadata.title,
        description: metadata.description || '',
        category: metadata.category,
        tags: metadata.tags || [],
        priceSui: new Decimal(metadata.price_sui),
        dataHash: uploadStaging.dataHash,
        totalSales: 0,
        averageRating: new Decimal(0),
        status: 'published',
        blobId: uploadStaging.filePath,
        kioskId,
        publishedAt: new Date(),
      },
    });

    // Update upload staging with published status and link to DataPod
    await prisma.uploadStaging.update({
      where: { id: upload_id },
      data: {
        status: 'published',
        datapodId: datapod.id,
      },
    });

    // Store transaction digest for audit trail
    await prisma.transactionAudit.create({
      data: {
        txDigest,
        txType: 'publish_datapod',
        userAddress: sellerAddress || '',
        userId: seller.id,
        datapodId: datapod.id,
        data: { datapodId, kioskId },
      },
    });

    logger.info('DataPod published', {
      requestId: req.requestId,
      datapodId,
      kioskId,
    });

    // Invalidate marketplace cache
    await CacheService.invalidateMarketplaceCache();

    // Emit WebSocket event for real-time updates
    try {
      const { broadcaster } = await import('@/main');
      if (broadcaster) {
        await broadcaster.broadcastEvent({
          type: 'datapod.published',
          data: {
            datapod_id: datapodId,
            title: metadata.title,
            category: metadata.category,
            price_sui: metadata.price_sui,
            seller_address: seller.zkloginAddress,
            kiosk_id: kioskId,
          },
          timestamp: Math.floor(Date.now() / 1000),
          eventId: randomUUID(),
          blockHeight: 0,
        });
      }
    } catch (wsError) {
      logger.warn('Failed to emit WebSocket event', { error: wsError });
      // Continue anyway - WebSocket is not critical
    }

    res.status(200).json({
      status: 'success',
      datapod_id: datapodId,
      kiosk_id: kioskId,
      tx_digest: txDigest,
      message: 'DataPod published successfully',
    });
  } catch (error) {
    logger.error('Publish failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Get seller's DataPods
 */
export const getSellerDataPods = async (req: Request, res: Response): Promise<void> => {
  try {
    const seller = await prisma.user.findFirst({
      where: {
        OR: [
          { zkloginAddress: req.user!.address },
          { walletAddress: req.user!.address },
        ],
      },
    });

    if (!seller) {
      throw new ValidationError('Seller not found');
    }

    const datapods = await prisma.dataPod.findMany({
      where: {
        sellerId: seller.id,
        deletedAt: null,
      },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      include: {
        seller: {
          select: {
            id: true,
            username: true,
            averageRating: true,
          },
        },
      },
    });

    res.status(200).json({
      status: 'success',
      count: datapods.length,
      datapods,
    });
  } catch (error) {
    logger.error('Get seller DataPods failed', { error, requestId: req.requestId });
    throw error;
  }
};

/**
 * Get seller stats
 */
export const getSellerStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const seller = await prisma.user.findFirst({
      where: {
        OR: [
          { zkloginAddress: req.user!.address },
          { walletAddress: req.user!.address },
        ],
      },
    });

    if (!seller) {
      throw new ValidationError('Seller not found');
    }

    const stats = {
      totalDataPods: await prisma.dataPod.count({
        where: { sellerId: seller.id, deletedAt: null },
      }),
      totalSales: seller.totalSales,
      totalRevenue: seller.totalRevenue.toString(),
      averageRating: seller.averageRating ? seller.averageRating.toString() : new Decimal(0).toString(),
      reputationScore: seller.reputationScore,
    };

    res.status(200).json({
      status: 'success',
      stats,
    });
  } catch (error) {
    logger.error('Get seller stats failed', { error, requestId: req.requestId });
    throw error;
  }
};
