import { Request, Response, NextFunction } from 'express';
import jwt, { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { AppError, AuthenticationError, ErrorCode } from '@/types/errors.types';
import { BlockchainService } from '@/services/blockchain.service';
import { AuthenticationError as AuthError } from '@/types/errors.types';
// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        address: string;
        email?: string;
        zkloginAddress: string;
        iat: number;
        exp: number;
      };
      requestId?: string;
    }
  }
}

interface JWTPayload {
  address: string;
  email?: string;
  zkloginAddress: string;
  iat: number;
  exp: number;
}

/**
 * Authentication middleware - Verify JWT token
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      logger.warn('Missing authorization header', { requestId: req.requestId });
      throw new AuthError('Missing authorization header');
    }

    // Extract token from "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      logger.warn('Invalid authorization header format', { requestId: req.requestId });
      throw new AuthError('Invalid authorization header format');
    }

    const token = parts[1];

    // Verify JWT signature
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;

      // Check token expiration
      if (decoded.exp < Math.floor(Date.now() / 1000)) {
        logger.warn('Token expired', { requestId: req.requestId, address: decoded.address });
        throw new AuthError('Token expired');
      }

      // Attach user info to request
      req.user = {
        address: decoded.address,
        email: decoded.email,
        zkloginAddress: decoded.zkloginAddress,
        iat: decoded.iat,
        exp: decoded.exp,
      };

      logger.debug('User authenticated', {
        requestId: req.requestId,
        address: decoded.address,
      });

      next();
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        logger.warn('Token expired', { requestId: req.requestId });
        throw new AuthenticationError('Token expired');
      }
      if (error instanceof JsonWebTokenError) {
        logger.warn('Invalid token', { requestId: req.requestId });
        throw new AuthenticationError('Invalid token');
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: error.message,
          statusCode: 401,
          requestId: req.requestId,
        },
      });
      return;
    }

    logger.error('Authentication middleware error', { error, requestId: req.requestId });
    res.status(401).json({
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Authentication failed',
        statusCode: 401,
        requestId: req.requestId,
      },
    });
  }
};

/**
 * Protected route middleware - Check user is authenticated
 */
export const protectedRoute = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    logger.warn('Unauthorized access attempt', { requestId: req.requestId });
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'User not authenticated',
        statusCode: 401,
        requestId: req.requestId,
      },
    });
    return;
  }

  next();
};

/**
 * Verify ZKLogin signer
 */
export const verifyZKLoginSigner = async (
  ephemeralSignerPubkey: string,
  jwtToken: string,
): Promise<string> => {
  try {
    // Decode JWT without verification first to get payload
    const decoded = jwt.decode(jwtToken) as any;

    if (!decoded) {
      throw new AuthenticationError('Invalid JWT token');
    }

    // Check signer age < 24 hours
    const signerAge = Math.floor(Date.now() / 1000) - decoded.iat;
    if (signerAge > 86400) {
      // 24 hours
      throw new AuthenticationError('ZKLogin signer expired (> 24 hours)');
    }

    // Verify Google OAuth proof is valid
    // This would typically involve verifying the JWT signature
    // and checking the Google OAuth claims
    try {
      const verified = jwt.verify(jwtToken, env.JWT_SECRET) as JWTPayload;

      if (!verified.zkloginAddress) {
        throw new AuthenticationError('Invalid ZKLogin address in token');
      }

      logger.info('ZKLogin signer verified', {
        address: verified.zkloginAddress,
        signerAge,
      });

      return verified.zkloginAddress;
    } catch (error) {
      logger.warn('ZKLogin verification failed', { error });
      throw new AuthenticationError('ZKLogin verification failed');
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    logger.error('ZKLogin signer verification error', { error });
    throw new AuthenticationError('ZKLogin signer verification failed');
  }
};

/**
 * Signature verification middleware
 */
export const signatureVerification = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { message, signature, publicKey } = req.body;

    if (!message || !signature || !publicKey) {
      logger.warn('Missing signature verification data', { requestId: req.requestId });
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing message, signature, or publicKey',
          statusCode: 400,
          requestId: req.requestId,
        },
      });
      return;
    }

    // Verify signature using blockchain service
    const isValid = BlockchainService.verifySignature(message, signature, publicKey);

    if (!isValid) {
      logger.warn('Signature verification failed', { requestId: req.requestId });
      res.status(403).json({
        error: {
          code: 'SIGNATURE_VERIFICATION_FAILED',
          message: 'Signature verification failed',
          statusCode: 403,
          requestId: req.requestId,
        },
      });
      return;
    }

    // Attach verified data to request
    req.body.verifiedPublicKey = publicKey;
    req.body.verifiedMessage = message;

    logger.debug('Signature verified', { requestId: req.requestId });
    next();
  } catch (error) {
    logger.error('Signature verification middleware error', { error, requestId: req.requestId });
    res.status(403).json({
      error: {
        code: 'SIGNATURE_VERIFICATION_ERROR',
        message: 'Signature verification error',
        statusCode: 403,
        requestId: req.requestId,
      },
    });
  }
};

/**
 * Generate JWT token
 */
export const generateToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  // JWT_EXPIRY is a string like '7d', convert to seconds
  const expiresIn = typeof env.JWT_EXPIRY === 'string' ? env.JWT_EXPIRY : '7d';

  const token = jwt.sign(
    payload,
    env.JWT_SECRET as string,
    {
      algorithm: 'HS256',
      expiresIn,
    } as any,
  );

  return token;
};

/**
 * Verify and decode JWT token
 */
export const verifyToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET as string) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }
    throw new AuthenticationError('Token verification failed');
  }
};
