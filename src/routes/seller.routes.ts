import { Router } from 'express';
import * as sellerController from '@/controllers/seller.controller';
import { authMiddleware } from '@/middleware/auth.middleware';
import { upload } from '@/middleware/upload.middleware';
import { asyncHandler } from '@/utils/async-handler';

const router = Router();

// All seller routes require authentication
router.use(authMiddleware);

// Upload data
router.post('/upload', upload.single('file'), asyncHandler(sellerController.uploadData));

// Publish DataPod
router.post('/publish', asyncHandler(sellerController.publishDataPod));

// Get seller datapods
router.get('/datapods', asyncHandler(sellerController.getSellerDataPods));

// Get seller statistics
router.get('/stats', asyncHandler(sellerController.getSellerStats));

export default router;
