import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';

/**
 * CORS configuration
 */
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://sourcenet-fe.vercel.app/',
      ...(env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : []),
    ].filter(Boolean);

    // Add production URLs if available
    if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);
    if (process.env.FRONTEND_URL_PROD) allowedOrigins.push(process.env.FRONTEND_URL_PROD);

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS request blocked', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200,
};

/**
 * CORS middleware
 */
export const corsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const origin = req.get('origin');

  if (!origin) {
    return next();
  }

  corsConfig.origin(origin, (err, allow) => {
    if (err) {
      logger.warn('CORS error', { origin, error: err.message });
      res.status(403).json({
        error: {
          code: 'CORS_ERROR',
          message: 'CORS policy violation',
          statusCode: 403,
          requestId: req.requestId,
        },
      });
      return;
    }

    if (allow) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', corsConfig.maxAge.toString());
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    next();
  });
};

/**
 * Security headers middleware using helmet
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});

/**
 * Custom security headers middleware
 */
export const customSecurityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Disable client-side caching for sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Prevent information disclosure
  res.removeHeader('Server');
  res.removeHeader('X-Powered-By');

  // Set Strict-Transport-Security in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  next();
};

/**
 * Request ID header middleware
 */
export const requestIdHeader = (req: Request, res: Response, next: NextFunction): void => {
  if (req.requestId) {
    res.setHeader('X-Request-ID', req.requestId);
  }
  next();
};
