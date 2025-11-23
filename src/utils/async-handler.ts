import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

/**
 * Wrapper for async route handlers to catch errors
 * Passes errors to Express error handler middleware
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      logger.error('Async handler error', {
        error: error instanceof Error ? error.message : String(error),
        requestId: req.requestId,
      });
      next(error);
    });
  };
};
