import { z } from 'zod';
import { logger } from '@/utils/logger';

// Zod schema for DataPodDelisted event
const DataPodDelistedSchema = z.object({
  datapod_id: z.string(),
  seller_address: z.string(),
});

export type DataPodDelistedEvent = z.infer<typeof DataPodDelistedSchema>;

export interface ParsedDelistingEvent {
  datapod_id: string;
  seller_address: string;
  status: 'delisted';
}

/**
 * Parse DataPodDelisted event
 */
export function parseDataPodDelisted(eventData: any): ParsedDelistingEvent | null {
  try {
    const validated = DataPodDelistedSchema.parse(eventData);

    return {
      datapod_id: validated.datapod_id,
      seller_address: validated.seller_address,
      status: 'delisted',
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('DataPodDelisted validation error', {
        errors: error.errors,
        data: eventData,
      });
    } else {
      logger.error('Failed to parse DataPodDelisted event', { error, eventData });
    }
    return null;
  }
}
