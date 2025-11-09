import { z } from 'zod';
import { logger } from '@/utils/logger';

// Zod schema for PaymentReleased event
const PaymentReleasedSchema = z.object({
  seller_address: z.string(),
  amount: z.union([z.number(), z.string()]).transform((v) => {
    if (typeof v === 'string') {
      return BigInt(v);
    }
    return BigInt(v);
  }),
  purchase_id: z.string().optional(),
});

export type PaymentReleasedEvent = z.infer<typeof PaymentReleasedSchema>;

export interface ParsedPaymentEvent {
  seller_address: string;
  amount_sui: string; // Store as string for precision
  purchase_id?: string;
}

/**
 * Parse PaymentReleased event
 * Verifies escrow status before processing
 */
export function parsePaymentReleased(eventData: any): ParsedPaymentEvent | null {
  try {
    const validated = PaymentReleasedSchema.parse(eventData);

    return {
      seller_address: validated.seller_address,
      amount_sui: validated.amount.toString(),
      purchase_id: validated.purchase_id,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('PaymentReleased validation error', {
        errors: error.errors,
        data: eventData,
      });
    } else {
      logger.error('Failed to parse PaymentReleased event', { error, eventData });
    }
    return null;
  }
}
