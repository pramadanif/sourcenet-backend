import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

/**
 * Create or update review
 * POST /api/reviews
 */
export async function createReview(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).userId;
    const { purchaseRequestId, datapodId, rating, comment } = req.body;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
      return;
    }

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({
        error: {
          code: 'INVALID_RATING',
          message: 'Rating must be between 1 and 5',
        },
      });
      return;
    }

    // Find purchase request
    const purchase = await prisma.purchaseRequest.findUnique({
      where: { purchaseRequestId },
      include: { buyer: true, datapod: true },
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
          message: 'Only the buyer can leave a review',
        },
      });
      return;
    }

    // Check if purchase is completed
    if (purchase.status !== 'completed') {
      res.status(400).json({
        error: {
          code: 'PURCHASE_NOT_COMPLETED',
          message: 'Can only review completed purchases',
        },
      });
      return;
    }

    // Create or update review
    const review = await prisma.review.upsert({
      where: {
        datapodId_buyerId: {
          datapodId: purchase.datapodId,
          buyerId: userId,
        },
      },
      update: {
        rating,
        comment: comment || null,
      },
      create: {
        datapodId: purchase.datapodId,
        purchaseRequestId,
        buyerId: userId,
        buyerAddress: purchase.buyerAddress,
        rating,
        comment: comment || null,
      },
    });

    // Recalculate datapod average rating
    const reviews = await prisma.review.findMany({
      where: { datapodId: purchase.datapodId },
      select: { rating: true },
    });

    const averageRating =
      reviews.length > 0 ? reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviews.length : null;

    await prisma.dataPod.update({
      where: { id: purchase.datapodId },
      data: {
        averageRating: averageRating ? averageRating.toString() : null,
      },
    });

    logger.info('Review created', { reviewId: review.id, datapodId: purchase.datapodId, rating });

    res.status(201).json({
      status: 'success',
      data: { review },
    });
  } catch (error) {
    logger.error('Create review error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create review',
      },
    });
  }
}

/**
 * Get reviews for a datapod
 * GET /api/reviews/datapod/:datapodId
 */
export async function getDataPodReviews(req: Request, res: Response): Promise<void> {
  try {
    const { datapodId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    const reviews = await prisma.review.findMany({
      where: { datapodId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      include: {
        buyer: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    const total = await prisma.review.count({
      where: { datapodId },
    });

    res.status(200).json({
      status: 'success',
      data: {
        reviews,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      },
    });
  } catch (error) {
    logger.error('Get datapod reviews error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get reviews',
      },
    });
  }
}

/**
 * Get user's reviews
 * GET /api/reviews/my-reviews
 */
export async function getUserReviews(req: Request, res: Response): Promise<void> {
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

    const reviews = await prisma.review.findMany({
      where: { buyerId: userId },
      orderBy: { createdAt: 'desc' },
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

    const total = await prisma.review.count({
      where: { buyerId: userId },
    });

    res.status(200).json({
      status: 'success',
      data: {
        reviews,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      },
    });
  } catch (error) {
    logger.error('Get user reviews error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get reviews',
      },
    });
  }
}

/**
 * Delete review
 * DELETE /api/reviews/:reviewId
 */
export async function deleteReview(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).userId;
    const { reviewId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
      return;
    }

    // Find review
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      res.status(404).json({
        error: {
          code: 'REVIEW_NOT_FOUND',
          message: 'Review not found',
        },
      });
      return;
    }

    // Verify ownership
    if (review.buyerId !== userId) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You can only delete your own reviews',
        },
      });
      return;
    }

    // Delete review
    await prisma.review.delete({
      where: { id: reviewId },
    });

    // Recalculate average rating
    const reviews = await prisma.review.findMany({
      where: { datapodId: review.datapodId },
      select: { rating: true },
    });

    const averageRating =
      reviews.length > 0 ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length : null;

    await prisma.dataPod.update({
      where: { id: review.datapodId },
      data: {
        averageRating: averageRating ? averageRating.toString() : null,
      },
    });

    logger.info('Review deleted', { reviewId, datapodId: review.datapodId });

    res.status(200).json({
      status: 'success',
      message: 'Review deleted successfully',
    });
  } catch (error) {
    logger.error('Delete review error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete review',
      },
    });
  }
}
