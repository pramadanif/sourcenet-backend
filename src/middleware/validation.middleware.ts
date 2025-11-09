import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '@/utils/logger';

interface ValidationOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Validation middleware factory
 */
export const validate = (schemas: ValidationOptions) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors: Record<string, string[]> = {};

      // Validate body
      if (schemas.body) {
        try {
          req.body = await schemas.body.parseAsync(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.body = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
          }
        }
      }

      // Validate query
      if (schemas.query) {
        try {
          req.query = await schemas.query.parseAsync(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.query = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
          }
        }
      }

      // Validate params
      if (schemas.params) {
        try {
          req.params = await schemas.params.parseAsync(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.params = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
          }
        }
      }

      // If there are validation errors, return 400
      if (Object.keys(errors).length > 0) {
        logger.warn('Validation failed', {
          requestId: req.requestId,
          path: req.path,
          errors,
        });

        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            statusCode: 400,
            requestId: req.requestId,
            details: errors,
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Validation middleware error', { error, requestId: req.requestId });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          statusCode: 400,
          requestId: req.requestId,
        },
      });
    }
  };
};

/**
 * Validate request body only
 */
export const validateBody = (schema: ZodSchema) => {
  return validate({ body: schema });
};

/**
 * Validate request query only
 */
export const validateQuery = (schema: ZodSchema) => {
  return validate({ query: schema });
};

/**
 * Validate request params only
 */
export const validateParams = (schema: ZodSchema) => {
  return validate({ params: schema });
};
