import { Router } from 'express';
import {
  browseMarketplace,
  searchMarketplace,
  getDataPodDetails,
  getTopRated,
  getCategories,
  getDataPods,
} from '@/controllers/marketplace.controller';
import { asyncHandler } from '@/utils/async-handler';

const router = Router();

// GET /api/marketplace/datapods - Advanced datapods listing with filtering, sorting, caching
router.get('/datapods', asyncHandler(getDataPods));

// GET /api/marketplace/browse - Browse marketplace
router.get('/browse', asyncHandler(browseMarketplace));

// GET /api/marketplace/search - Search marketplace
router.get('/search', asyncHandler(searchMarketplace));

// GET /api/marketplace/datapods/:datapod_id - Get DataPod details
router.get('/datapods/:datapod_id', asyncHandler(getDataPodDetails));

// GET /api/marketplace/top-rated - Get top-rated DataPods
router.get('/top-rated', asyncHandler(getTopRated));

// GET /api/marketplace/categories - Get available categories
router.get('/categories', asyncHandler(getCategories));

export default router;
