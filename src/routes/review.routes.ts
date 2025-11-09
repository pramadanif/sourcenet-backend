import { Router } from 'express';
import {
  createReview,
  getDataPodReviews,
  getUserReviews,
  deleteReview,
} from '@/controllers/review.controller';
import { authMiddleware } from '@/middleware/auth.middleware';

const router = Router();

// POST /api/review - Create or update review (requires auth)
router.post('/', authMiddleware, createReview);

// GET /api/review/datapod/:datapodId - Get reviews for a datapod
router.get('/datapod/:datapodId', getDataPodReviews);

// GET /api/review/my-reviews - Get user's reviews (requires auth)
router.get('/my-reviews', authMiddleware, getUserReviews);

// DELETE /api/review/:reviewId - Delete review (requires auth)
router.delete('/:reviewId', authMiddleware, deleteReview);

export default router;
