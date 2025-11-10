import { Router } from 'express';
import { protectedRoute } from '@/middleware/auth.middleware';
import {
  createPurchase,
  getPurchaseStatus,
  getDownloadUrl,
  downloadData,
  getPurchaseDetails,
  submitReview,
} from '@/controllers/buyer.controller';

const router = Router();

// All buyer routes require authentication
router.use(protectedRoute);

// POST /api/buyer/purchase - Create purchase
router.post('/purchase', createPurchase);

// GET /api/buyer/purchase/:purchase_id - Get purchase status with caching
router.get('/purchase/:purchase_id', getPurchaseStatus);

// GET /api/buyer/purchase/:purchase_id/details - Get full purchase details
router.get('/purchase/:purchase_id/details', getPurchaseDetails);

// GET /api/download/:purchase_id - Get download URL with rate limiting
router.get('/download/:purchase_id', getDownloadUrl);

// POST /api/download/:purchase_id - Download data (legacy endpoint)
router.post('/download/:purchase_id', downloadData);

// POST /api/buyer/purchase/:purchase_id/review - Submit review
router.post('/purchase/:purchase_id/review', submitReview);

export default router;
