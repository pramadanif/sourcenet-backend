import { Router } from 'express';
import buyerRoutes from './buyer.routes';
import marketplaceRoutes from './marketplace.routes';
import authRoutes from './auth.routes';
import sellerRoutes from './seller.routes';
import reviewRoutes from './review.routes';
import healthRoutes from './health.routes';

const router = Router();

// Health check
if (healthRoutes) {
  router.use('/health', healthRoutes);
}

// Auth routes
if (authRoutes) {
  router.use('/auth', authRoutes);
}

// Marketplace routes
if (marketplaceRoutes) {
  router.use('/marketplace', marketplaceRoutes);
}

// Buyer routes
if (buyerRoutes) {
  router.use('/buyer', buyerRoutes);
}

// Seller routes
if (sellerRoutes) {
  router.use('/seller', sellerRoutes);
}

// Review routes
if (reviewRoutes) {
  router.use('/review', reviewRoutes);
}

export default router;
