import { z } from 'zod';
import { logger } from '@/utils/logger';

// Zod schema for DataPodPublished event
const DataPodPublishedSchema = z.object({
  datapod_id: z.string(),
  seller: z.string(),
  title: z.string(),
  category: z.string(),
  price: z.union([z.number(), z.string()]).transform((v) => {
    if (typeof v === 'string') {
      return BigInt(v);
    }
    return BigInt(v);
  }),
  data_hash: z.string().optional(),
  kiosk_id: z.string().optional().transform((v) => v || ''),
});

export type DataPodPublishedEvent = z.infer<typeof DataPodPublishedSchema>;

export interface ParsedDataPodEvent {
  datapod_id: string;
  seller_address: string;
  title: string;
  category: string;
  price_sui: string; // Store as string for precision
  data_hash: string;
  kiosk_id: string | null;
}

/**
 * Parse DataPodPublished event
 */
export function parseDataPodPublished(eventData: any): ParsedDataPodEvent | null {
  try {
    const validated = DataPodPublishedSchema.parse(eventData);

    return {
      datapod_id: validated.datapod_id,
      seller_address: validated.seller,
      title: validated.title,
      category: validated.category,
      price_sui: validated.price.toString(),
      data_hash: validated.data_hash || '',
      kiosk_id: validated.kiosk_id || null,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('DataPodPublished validation error', {
        errors: error.errors,
        data: eventData,
      });
    } else {
      logger.error('Failed to parse DataPodPublished event', { error, eventData });
    }
    return null;
  }
}
