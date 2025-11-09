// Gas budgets (in MIST, 1 SUI = 10^9 MIST)
export const GAS_BUDGET = {
  PUBLISH_DATAPOD: 5_000_000, // 0.005 SUI
  PURCHASE: 5_000_000, // 0.005 SUI
  UPDATE_DATAPOD: 2_000_000, // 0.002 SUI
  ADD_REVIEW: 2_000_000, // 0.002 SUI
  RELEASE_PAYMENT: 2_000_000, // 0.002 SUI
} as const;

// Limits
export const LIMITS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_TITLE_LENGTH: 200,
  MIN_TITLE_LENGTH: 10,
  MAX_PRICE: 1000,
  MIN_PRICE: 0.1,
} as const;

// Cache TTL (seconds)
export const CACHE_TTL = {
  MARKETPLACE: 3600, // 1 hour
  DATAPOD_DETAIL: 1800, // 30 minutes
  SELLER_PROFILE: 3600, // 1 hour
  TOP_RATED: 21600, // 6 hours
  REVIEWS: 1800, // 30 minutes
} as const;

// Polling intervals (milliseconds)
export const POLLING = {
  BLOCKCHAIN_EVENTS: 3000, // 3 seconds
  INDEXER_HEALTH_CHECK: 60000, // 1 minute
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_PAGE: 1,
} as const;

// Event types
export const EVENT_TYPES = {
  DATAPOD_PUBLISHED: 'datapod.published',
  PURCHASE_COMPLETED: 'purchase.completed',
  PAYMENT_RELEASED: 'payment.released',
  REVIEW_ADDED: 'review.added',
  DATAPOD_DELISTED: 'datapod.delisted',
} as const;
