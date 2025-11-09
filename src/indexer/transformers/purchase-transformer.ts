import { logger } from '@/utils/logger';
import { ParsedPurchaseEvent, ParsedPurchaseCompletedEvent } from '@/indexer/parsers/purchase-parser';

export interface TransformedPurchaseRequest {
  purchase_request_id: string;
  datapod_id: string;
  buyer_address: string;
  seller_address: string;
  price_sui: string;
  status: 'pending' | 'completed';
  encrypted_blob_id: string | null;
  created_at: Date;
  indexed_at: Date;
}

export interface TransformedPurchaseCompleted {
  purchase_request_id: string;
  status: 'completed';
  encrypted_blob_id: string;
  indexed_at: Date;
}

/**
 * Transform PurchaseRequestCreated event to database schema
 */
export function transformPurchaseRequestCreated(
  parsed: ParsedPurchaseEvent,
): TransformedPurchaseRequest | null {
  try {
    return {
      purchase_request_id: parsed.purchase_id,
      datapod_id: parsed.datapod_id,
      buyer_address: parsed.buyer_address,
      seller_address: parsed.seller_address,
      price_sui: parsed.price_sui,
      status: 'pending',
      encrypted_blob_id: null,
      created_at: new Date(),
      indexed_at: new Date(),
    };
  } catch (error) {
    logger.error('Failed to transform PurchaseRequestCreated event', { error, parsed });
    return null;
  }
}

/**
 * Transform PurchaseCompleted event to database schema
 */
export function transformPurchaseCompleted(
  parsed: ParsedPurchaseCompletedEvent,
): TransformedPurchaseCompleted | null {
  try {
    return {
      purchase_request_id: parsed.purchase_id,
      status: 'completed',
      encrypted_blob_id: parsed.encrypted_blob_id,
      indexed_at: new Date(),
    };
  } catch (error) {
    logger.error('Failed to transform PurchaseCompleted event', { error, parsed });
    return null;
  }
}
