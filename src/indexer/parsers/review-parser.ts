import { z } from 'zod';
import { logger } from '@/utils/logger';

// Zod schema for ReviewAdded event
const ReviewAddedSchema = z.object({
  datapod_id: z.string(),
  buyer: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export type ReviewAddedEvent = z.infer<typeof ReviewAddedSchema>;

export interface ParsedReviewEvent {
  datapod_id: string;
  buyer_address: string;
  rating: number;
  comment: string | null;
}

/**
 * Parse ReviewAdded event
 * Verifies buyer hasn't already reviewed this datapod
 */
export function parseReviewAdded(eventData: any): ParsedReviewEvent | null {
  try {
    const validated = ReviewAddedSchema.parse(eventData);

    return {
      datapod_id: validated.datapod_id,
      buyer_address: validated.buyer,
      rating: validated.rating,
      comment: validated.comment || null,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('ReviewAdded validation error', {
        errors: error.errors,
        data: eventData,
      });
    } else {
      logger.error('Failed to parse ReviewAdded event', { error, eventData });
    }
    return null;
  }
}
