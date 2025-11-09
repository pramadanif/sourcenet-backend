import { z } from 'zod';
import { logger } from '@/utils/logger';

// Zod schema for PurchaseRequestCreated event
const PurchaseRequestCreatedSchema = z.object({
  purchase_id: z.string(),
  datapod_id: z.string(),
  buyer: z.string(),
  seller: z.string(),
  price: z.union([z.number(), z.string()]).transform((v) => {
    if (typeof v === 'string') {
      return BigInt(v);
    }
    return BigInt(v);
  }),
});

export type PurchaseRequestCreatedEvent = z.infer<typeof PurchaseRequestCreatedSchema>;

export interface ParsedPurchaseEvent {
  purchase_id: string;
  datapod_id: string;
  buyer_address: string;
  seller_address: string;
  price_sui: string;
}

/**
 * Parse PurchaseRequestCreated event
 * Note: buyer_public_key should be fetched from database separately
 */
export function parsePurchaseRequestCreated(eventData: any): ParsedPurchaseEvent | null {
  try {
    const validated = PurchaseRequestCreatedSchema.parse(eventData);

    return {
      purchase_id: validated.purchase_id,
      datapod_id: validated.datapod_id,
      buyer_address: validated.buyer,
      seller_address: validated.seller,
      price_sui: validated.price.toString(),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('PurchaseRequestCreated validation error', {
        errors: error.errors,
        data: eventData,
      });
    } else {
      logger.error('Failed to parse PurchaseRequestCreated event', { error, eventData });
    }
    return null;
  }
}

// Zod schema for PurchaseCompleted event
const PurchaseCompletedSchema = z.object({
  purchase_id: z.string(),
  datapod_id: z.string(),
  buyer: z.string(),
  seller: z.string(),
  encrypted_blob_id: z.string(),
});

export interface ParsedPurchaseCompletedEvent {
  purchase_id: string;
  datapod_id: string;
  buyer_address: string;
  seller_address: string;
  encrypted_blob_id: string;
}

/**
 * Parse PurchaseCompleted event
 */
export function parsePurchaseCompleted(eventData: any): ParsedPurchaseCompletedEvent | null {
  try {
    const validated = PurchaseCompletedSchema.parse(eventData);

    return {
      purchase_id: validated.purchase_id,
      datapod_id: validated.datapod_id,
      buyer_address: validated.buyer,
      seller_address: validated.seller,
      encrypted_blob_id: validated.encrypted_blob_id,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('PurchaseCompleted validation error', {
        errors: error.errors,
        data: eventData,
      });
    } else {
      logger.error('Failed to parse PurchaseCompleted event', { error, eventData });
    }
    return null;
  }
}
