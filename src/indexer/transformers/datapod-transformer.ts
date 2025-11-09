import { logger } from '@/utils/logger';
import { ParsedDataPodEvent } from '@/indexer/parsers/datapod-parser';
import { ParsedDelistingEvent } from '@/indexer/parsers/delisting-parser';

export interface TransformedDataPod {
  datapod_id: string;
  seller_address: string;
  title: string;
  category: string;
  price_sui: string;
  status: 'available' | 'delisted';
  blob_id: string | null;
  total_sales: number;
  average_rating: number | null;
  published_at: Date;
  indexed_at: Date;
}

/**
 * Transform DataPodPublished event to database schema
 */
export function transformDataPodPublished(
  parsed: ParsedDataPodEvent,
): TransformedDataPod | null {
  try {
    return {
      datapod_id: parsed.datapod_id,
      seller_address: parsed.seller_address,
      title: parsed.title,
      category: parsed.category,
      price_sui: parsed.price_sui,
      status: 'available',
      blob_id: null, // Will be set when data is uploaded
      total_sales: 0,
      average_rating: null,
      published_at: new Date(),
      indexed_at: new Date(),
    };
  } catch (error) {
    logger.error('Failed to transform DataPodPublished event', { error, parsed });
    return null;
  }
}

/**
 * Transform DataPodDelisted event to database schema
 */
export function transformDataPodDelisted(
  parsed: ParsedDelistingEvent,
): { datapod_id: string; status: 'delisted'; indexed_at: Date } | null {
  try {
    return {
      datapod_id: parsed.datapod_id,
      status: 'delisted',
      indexed_at: new Date(),
    };
  } catch (error) {
    logger.error('Failed to transform DataPodDelisted event', { error, parsed });
    return null;
  }
}
