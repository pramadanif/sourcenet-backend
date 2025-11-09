import { Router } from 'express';
import * as downloadController from '@/controllers/download.controller';
import { authMiddleware } from '@/middleware/auth.middleware';

const router = Router();

// All download routes require authentication
router.use(authMiddleware);

// Download purchased data
router.get('/:purchaseRequestId', downloadController.downloadPurchasedData);

// Get download history
router.get('/history', downloadController.getDownloadHistory);

export default router;
