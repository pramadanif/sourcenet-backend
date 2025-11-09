import { logger } from '@/utils/logger';

export interface SellerStats {
  seller_address: string;
  total_sales: number;
  total_revenue: string; // Store as string for precision
  average_rating: number | null;
  updated_at: Date;
}

export interface PurchaseForStats {
  seller_address: string;
  price_sui: string;
  rating?: number;
}

/**
 * Aggregate seller statistics from purchases
 */
export function aggregateSellerStats(purchases: PurchaseForStats[]): Map<string, SellerStats> {
  const statsMap = new Map<string, SellerStats>();

  try {
    for (const purchase of purchases) {
      const existing = statsMap.get(purchase.seller_address) || {
        seller_address: purchase.seller_address,
        total_sales: 0,
        total_revenue: '0',
        average_rating: null,
        updated_at: new Date(),
      };

      // Update sales count
      existing.total_sales += 1;

      // Update revenue
      const currentRevenue = BigInt(existing.total_revenue);
      const purchaseAmount = BigInt(purchase.price_sui);
      existing.total_revenue = (currentRevenue + purchaseAmount).toString();

      // Update average rating if available
      if (purchase.rating !== undefined) {
        const currentRating = existing.average_rating || 0;
        existing.average_rating =
          (currentRating * (existing.total_sales - 1) + purchase.rating) / existing.total_sales;
      }

      existing.updated_at = new Date();
      statsMap.set(purchase.seller_address, existing);
    }

    return statsMap;
  } catch (error) {
    logger.error('Failed to aggregate seller stats', { error, purchaseCount: purchases.length });
    return statsMap;
  }
}

/**
 * Calculate average rating for a datapod
 */
export function calculateAverageRating(ratings: number[]): number | null {
  if (ratings.length === 0) {
    return null;
  }

  const sum = ratings.reduce((acc, rating) => acc + rating, 0);
  return sum / ratings.length;
}
