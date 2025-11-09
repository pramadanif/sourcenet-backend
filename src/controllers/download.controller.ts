import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';
import { WalrusService } from '@/services/walrus.service';
import { EncryptionService } from '@/services/encryption.service';

const prisma = new PrismaClient();
const walrusService = new WalrusService();
const encryptionService = new EncryptionService();

/**
 * Download purchased data
 * GET /api/download/:purchaseRequestId
 */
export async function downloadPurchasedData(req: Request, res: Response): Promise<void> {
  try {
    const { purchaseRequestId } = req.params;
    const userId = (req as any).userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
      return;
    }

    // Find purchase request
    const purchase = await prisma.purchaseRequest.findUnique({
      where: { purchaseRequestId },
      include: {
        datapod: true,
        buyer: true,
      },
    });

    if (!purchase) {
      res.status(404).json({
        error: {
          code: 'PURCHASE_NOT_FOUND',
          message: 'Purchase request not found',
        },
      });
      return;
    }

    // Verify buyer is the current user
    if (purchase.buyerId !== userId) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to download this data',
        },
      });
      return;
    }

    // Check if purchase is completed
    if (purchase.status !== 'completed') {
      res.status(400).json({
        error: {
          code: 'PURCHASE_NOT_COMPLETED',
          message: 'Purchase is not completed yet',
        },
      });
      return;
    }

    // Get encrypted blob from Walrus
    if (!purchase.encryptedBlobId) {
      res.status(400).json({
        error: {
          code: 'NO_BLOB_ID',
          message: 'Encrypted blob not available',
        },
      });
      return;
    }

    const encryptedData = await WalrusService.getBlob(purchase.encryptedBlobId);

    // Decrypt data using buyer's private key
    if (!purchase.decryptionKey) {
      res.status(400).json({
        error: {
          code: 'NO_DECRYPTION_KEY',
          message: 'Decryption key not available',
        },
      });
      return;
    }

    const decryptedData = await EncryptionService.decryptData(
      '', // encryptedEphemeralKeyB64
      encryptedData.toString('base64'),
      '', // nonceB64
      '', // tagB64
      purchase.decryptionKey,
    );

    // Log download
    await prisma.transactionAudit.create({
      data: {
        txType: 'download',
        userAddress: purchase.buyerAddress,
        userId,
        datapodId: purchase.datapodId,
        data: {
          purchaseRequestId,
          downloadedAt: new Date(),
        },
      },
    });

    logger.info('Data downloaded', { purchaseRequestId, userId });

    // Send file
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="data-${purchaseRequestId}.bin"`);
    res.send(decryptedData);
  } catch (error) {
    logger.error('Download data error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to download data',
      },
    });
  }
}

/**
 * Get download history
 * GET /api/download/history
 */
export async function getDownloadHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).userId;
    const { limit = 10, offset = 0 } = req.query;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
      return;
    }

    const downloads = await prisma.transactionAudit.findMany({
      where: {
        userId,
        txType: 'download',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      include: {
        datapod: {
          select: {
            id: true,
            datapodId: true,
            title: true,
            category: true,
          },
        },
      },
    });

    const total = await prisma.transactionAudit.count({
      where: {
        userId,
        txType: 'download',
      },
    });

    res.status(200).json({
      status: 'success',
      data: {
        downloads,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      },
    });
  } catch (error) {
    logger.error('Get download history error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get download history',
      },
    });
  }
}
