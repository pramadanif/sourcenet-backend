import { Router } from 'express';
import * as sellerController from '@/controllers/seller.controller';
import { authMiddleware } from '@/middleware/auth.middleware';
import { upload } from '@/middleware/upload.middleware';

const router = Router();

// All seller routes require authentication
router.use(authMiddleware);

// Upload data
router.post('/upload', upload.single('file'), sellerController.uploadData);

// Publish DataPod
router.post('/publish', sellerController.publishDataPod);

// Get seller datapods
router.get('/datapods', sellerController.getSellerDataPods);

// Get seller statistics
router.get('/stats', sellerController.getSellerStats);

export default router;
