import { Router } from 'express';
import { authMiddleware } from '@/middleware/auth.middleware';
import {
  createPurchase,
  getPurchaseStatus,
  getDownloadUrl,
  downloadData,
  getPurchaseDetails,
  submitReview,
  getBuyerPurchases
} from '@/controllers/buyer.controller';
import { asyncHandler } from '@/utils/async-handler';

const router = Router();

// All buyer routes require authentication
router.use(authMiddleware);

// POST /api/buyer/purchase - Create purchase
router.post('/purchase', asyncHandler(createPurchase));

router.get('/purchases', asyncHandler(getBuyerPurchases));

// GET /api/buyer/purchase/:purchase_id - Get purchase status with caching
router.get('/purchase/:purchase_id', asyncHandler(getPurchaseStatus));

// GET /api/buyer/purchase/:purchase_id/details - Get full purchase details
router.get('/purchase/:purchase_id/details', asyncHandler(getPurchaseDetails));

// GET /api/buyer/purchase/:purchase_id/download-url - Get download URL
router.get('/purchase/:purchase_id/download-url', asyncHandler(getDownloadUrl));

// GET /api/buyer/download/:purchase_id - Download data
router.get('/download/:purchase_id', asyncHandler(downloadData));

// POST /api/buyer/purchase/:purchase_id/review - Submit review
router.post('/purchase/:purchase_id/review', asyncHandler(submitReview));

export default router;
