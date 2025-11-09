import { Router } from 'express';
import {
  browseMarketplace,
  searchMarketplace,
  getDataPodDetails,
  getTopRated,
  getCategories,
  getDataPods,
} from '@/controllers/marketplace.controller';

const router = Router();

// GET /api/marketplace/datapods - Advanced datapods listing with filtering, sorting, caching
router.get('/datapods', getDataPods);

// GET /api/marketplace/browse - Browse marketplace
router.get('/browse', browseMarketplace);

// GET /api/marketplace/search - Search marketplace
router.get('/search', searchMarketplace);

// GET /api/marketplace/datapods/:datapod_id - Get DataPod details
router.get('/datapods/:datapod_id', getDataPodDetails);

// GET /api/marketplace/top-rated - Get top-rated DataPods
router.get('/top-rated', getTopRated);

// GET /api/marketplace/categories - Get available categories
router.get('/categories', getCategories);

export default router;
