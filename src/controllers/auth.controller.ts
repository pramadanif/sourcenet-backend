import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';

const prisma = new PrismaClient();

/**
 * Generate JWT token
 */
function generateToken(userId: string, address: string): string {
  return jwt.sign(
    {
      userId,
      address,
      iat: Math.floor(Date.now() / 1000),
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRY,
    } as any,
  );
}

/**
 * ZKLogin callback handler
 * POST /api/auth/zklogin/callback
 */
export async function handleZKLoginCallback(req: Request, res: Response): Promise<void> {
  try {
    const { address, email, username } = req.body;

    if (!address) {
      res.status(400).json({
        error: {
          code: 'MISSING_ADDRESS',
          message: 'Address is required',
        },
      });
      return;
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { zkloginAddress: address },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          zkloginAddress: address,
          googleEmail: email,
          username: username || `user_${address.slice(0, 8)}`,
        },
      });
      logger.info('New user created via ZKLogin', { userId: user.id, address });
    } else {
      // Update email if provided
      if (email && !user.googleEmail) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleEmail: email },
        });
      }
    }

    // Generate JWT token
    const token = generateToken(user.id, address);

    res.status(200).json({
      status: 'success',
      data: {
        token,
        user: {
          id: user.id,
          address: user.zkloginAddress,
          username: user.username,
          email: user.googleEmail,
        },
      },
    });
  } catch (error) {
    logger.error('ZKLogin callback error', { error });
    res.status(500).json({
      error: {
        code: 'ZKLOGIN_ERROR',
        message: 'Failed to process ZKLogin callback',
      },
    });
  }
}

/**
 * Get current user profile
 * GET /api/auth/me
 */
export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        zkloginAddress: true,
        username: true,
        googleEmail: true,
        bio: true,
        avatarUrl: true,
        websiteUrl: true,
        totalSales: true,
        totalRevenue: true,
        averageRating: true,
        reputationScore: true,
        isVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      data: { user },
    });
  } catch (error) {
    logger.error('Get current user error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get user profile',
      },
    });
  }
}

/**
 * Update user profile
 * PUT /api/auth/profile
 */
export async function updateUserProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).userId;
    const { username, bio, avatarUrl, websiteUrl } = req.body;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username && { username }),
        ...(bio && { bio }),
        ...(avatarUrl && { avatarUrl }),
        ...(websiteUrl && { websiteUrl }),
      },
      select: {
        id: true,
        zkloginAddress: true,
        username: true,
        bio: true,
        avatarUrl: true,
        websiteUrl: true,
      },
    });

    logger.info('User profile updated', { userId });

    res.status(200).json({
      status: 'success',
      data: { user },
    });
  } catch (error) {
    logger.error('Update user profile error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update user profile',
      },
    });
  }
}

/**
 * Logout (client-side token removal)
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    logger.info('User logged out', { userId: (req as any).userId });
    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to logout',
      },
    });
  }
}
