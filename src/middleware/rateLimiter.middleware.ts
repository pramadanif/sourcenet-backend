import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { CacheService } from '@/services/cache.service';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Skip counting successful requests
  skipFailedRequests?: boolean; // Skip counting failed requests
}

/**
 * Rate limiter middleware factory
 */
export const rateLimiter = (config: RateLimitConfig) => {
  const {
    windowMs,
    maxRequests,
    keyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Generate rate limit key
      const key = keyGenerator
        ? keyGenerator(req)
        : `ratelimit:${req.ip}:${req.path}`;

      // Get current count
      const cache = CacheService.getClient();
      const current = await cache.incr(key);

      // Set expiration on first request
      if (current === 1) {
        await cache.expire(key, Math.ceil(windowMs / 1000));
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());

      // Check if limit exceeded
      if (current > maxRequests) {
        logger.warn('Rate limit exceeded', {
          requestId: req.requestId,
          key,
          current,
          limit: maxRequests,
        });

        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            statusCode: 429,
            requestId: req.requestId,
            details: {
              retryAfter: Math.ceil(windowMs / 1000),
            },
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Rate limiter error', { error, requestId: req.requestId });
      // On error, allow request to proceed
      next();
    }
  };
};

/**
 * Create rate limiter by user
 */
export const createUserRateLimiter = (windowMs: number, maxRequests: number) => {
  return rateLimiter({
    windowMs,
    maxRequests,
    keyGenerator: (req) => {
      const userId = req.user?.address || req.ip;
      return `ratelimit:user:${userId}:${req.path}`;
    },
  });
};

/**
 * Create rate limiter by IP
 */
export const createIpRateLimiter = (windowMs: number, maxRequests: number) => {
  return rateLimiter({
    windowMs,
    maxRequests,
    keyGenerator: (req) => `ratelimit:ip:${req.ip}:${req.path}`,
  });
};

/**
 * Upload rate limiter: 5 requests/hour per user
 */
export const uploadRateLimiter = createUserRateLimiter(
  3600000, // 1 hour
  5, // 5 requests
);

/**
 * Purchase rate limiter: 10 requests/hour per user
 */
export const purchaseRateLimiter = createUserRateLimiter(
  3600000, // 1 hour
  10, // 10 requests
);

/**
 * Browse rate limiter: 100 requests/hour per IP
 */
export const browseRateLimiter = createIpRateLimiter(
  3600000, // 1 hour
  100, // 100 requests
);

/**
 * API rate limiter: 1000 requests/hour per IP
 */
export const apiRateLimiter = createIpRateLimiter(
  3600000, // 1 hour
  1000, // 1000 requests
);

/**
 * Auth rate limiter: 5 requests/15 minutes per IP
 */
export const authRateLimiter = createIpRateLimiter(
  900000, // 15 minutes
  5, // 5 requests
);

/**
 * AI User rate limiter: 20 requests/minute per user
 */
export const aiUserRateLimiter = createUserRateLimiter(
  60000, // 1 minute
  20, // 20 requests
);

/**
 * AI IP rate limiter: 100 requests/minute per IP
 */
export const aiIpRateLimiter = createIpRateLimiter(
  60000, // 1 minute
  100, // 100 requests
);
