import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '@/utils/logger';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  BlockchainError,
  EncryptionError,
  WalrusError,
  S3Error,
} from '@/types/errors.types';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
    requestId?: string;
    details?: Record<string, any>;
  };
}

/**
 * Central error handler middleware
 */
export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details: Record<string, any> | undefined;

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = error.errors.reduce(
      (acc, err) => {
        const path = err.path.join('.');
        if (!acc[path]) {
          acc[path] = [];
        }
        acc[path].push(err.message);
        return acc;
      },
      {} as Record<string, string[]>,
    );

    logger.warn('Validation error', {
      requestId: req.requestId,
      path: req.path,
      details,
    });
  }
  // Handle custom app errors
  else if (error instanceof ValidationError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = error.message;
    details = error.details;

    logger.warn('Validation error', {
      requestId: req.requestId,
      message,
      details,
    });
  } else if (error instanceof AuthenticationError) {
    statusCode = 401;
    code = 'AUTHENTICATION_ERROR';
    message = error.message;

    logger.warn('Authentication error', {
      requestId: req.requestId,
      message,
    });
  } else if (error instanceof BlockchainError) {
    statusCode = 500;
    code = 'BLOCKCHAIN_ERROR';
    message = error.message;

    logger.error('Blockchain error', {
      requestId: req.requestId,
      message,
      stack: error.stack,
    });
  } else if (error instanceof EncryptionError) {
    statusCode = 500;
    code = 'ENCRYPTION_ERROR';
    message = error.message;

    logger.error('Encryption error', {
      requestId: req.requestId,
      message,
      stack: error.stack,
    });
  } else if (error instanceof WalrusError) {
    statusCode = 500;
    code = 'WALRUS_ERROR';
    message = error.message;

    logger.error('Walrus error', {
      requestId: req.requestId,
      message,
      stack: error.stack,
    });
  } else if (error instanceof S3Error) {
    statusCode = 500;
    code = 'STORAGE_ERROR';
    message = error.message;

    logger.error('Storage error', {
      requestId: req.requestId,
      message,
      stack: error.stack,
    });
  } else if (error instanceof AppError) {
    statusCode = error.statusCode || 500;
    code = error.code || 'APP_ERROR';
    message = error.message;
    details = error.details;

    logger.error('Application error', {
      requestId: req.requestId,
      code,
      message,
      details,
      stack: error.stack,
    });
  } else if (error instanceof Error) {
    // Handle generic errors
    statusCode = 500;
    code = 'INTERNAL_SERVER_ERROR';
    message = error.message || 'An unexpected error occurred';

    logger.error('Unhandled error', {
      requestId: req.requestId,
      message,
      stack: (error as Error).stack,
    });
  }

  // Send error response
  const response: ErrorResponse = {
    error: {
      code,
      message,
      statusCode,
      requestId: req.requestId,
    },
  };

  if (details) {
    response.error.details = details;
  }

  // Log to Sentry in production for 5xx errors
  if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
    // TODO: Implement Sentry integration
    // Sentry.captureException(error as Error, { tags: { requestId: req.requestId } });
  }

  res.status(statusCode).json(response);
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  logger.warn('Route not found', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
  });

  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      statusCode: 404,
      requestId: req.requestId,
    },
  });
};
