import { AppError, ErrorCode } from '@/types/errors.types';
import { logger } from './logger';

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    statusCode: number;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Format error response consistently
 */
export function formatErrorResponse(error: unknown, requestId?: string): ErrorResponse {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        requestId: error.requestId || requestId,
        details: Object.keys(error.details).length > 0 ? error.details : undefined,
      },
    };
  }

  if (error instanceof Error) {
    return {
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: error.message,
        statusCode: 500,
        requestId,
      },
    };
  }

  return {
    error: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      statusCode: 500,
      requestId,
    },
  };
}

/**
 * Get HTTP status code from error
 */
export function getStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  return 500;
}

/**
 * Log error with context
 */
export function logError(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  if (error instanceof AppError) {
    logger.error(error.message, {
      code: error.code,
      statusCode: error.statusCode,
      requestId: error.requestId,
      details: error.details,
      ...context,
    });
  } else if (error instanceof Error) {
    logger.error(error.message, {
      stack: error.stack,
      ...context,
    });
  } else {
    logger.error('Unknown error occurred', {
      error: String(error),
      ...context,
    });
  }
}

/**
 * Handle async errors in route handlers
 */
export function asyncHandler(
  fn: (req: any, res: any, next: any) => Promise<void>,
) {
  return (req: any, res: any, next: any): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
