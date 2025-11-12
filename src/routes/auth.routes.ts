import { Router } from 'express';
import {
  handleZKLoginCallback,
  handleWalletCallback,
  getCurrentUser,
  updateUserProfile,
  logout,
} from '@/controllers/auth.controller';
import { authMiddleware } from '@/middleware/auth.middleware';

const router = Router();

// POST /api/auth/zklogin/callback - ZKLogin callback handler
router.post('/zklogin/callback', handleZKLoginCallback);

// POST /api/auth/wallet/callback - Wallet callback handler
router.post('/wallet/callback', handleWalletCallback);

// GET /api/auth/me - Get current user profile (requires auth)
router.get('/me', authMiddleware, getCurrentUser);

// PUT /api/auth/profile - Update user profile (requires auth)
router.put('/profile', authMiddleware, updateUserProfile);

// POST /api/auth/logout - Logout (requires auth)
router.post('/logout', authMiddleware, logout);

export default router;
