/**
 * WebSocket event types for real-time marketplace updates
 */

export enum WebSocketEventType {
  // Connection events
  CONNECTION_ESTABLISHED = 'connection.established',
  CONNECTION_CLOSED = 'connection.closed',

  // Subscription events
  SUBSCRIPTION_CONFIRMED = 'subscription.confirmed',
  UNSUBSCRIPTION_CONFIRMED = 'unsubscription.confirmed',

  // Marketplace events
  DATAPOD_PUBLISHED = 'datapod.published',
  DATAPOD_DELISTED = 'datapod.delisted',
  DATAPOD_PRICE_UPDATED = 'datapod.price_updated',

  // Purchase events
  PURCHASE_CREATED = 'purchase.created',
  PURCHASE_COMPLETED = 'purchase.completed',
  PURCHASE_FAILED = 'purchase.failed',

  // Payment events
  PAYMENT_RELEASED = 'payment.released',
  PAYMENT_FAILED = 'payment.failed',

  // Review events
  REVIEW_ADDED = 'review.added',
  REVIEW_UPDATED = 'review.updated',
  REVIEW_DELETED = 'review.deleted',

  // Heartbeat events
  PING = 'ping',
  PONG = 'pong',

  // Error events
  ERROR = 'error',
}

/**
 * Client message types
 */
export enum ClientMessageType {
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  PING = 'ping',
}

/**
 * Marketplace event subscriptions
 */
export const MARKETPLACE_EVENTS = [
  'datapod.published',
  'datapod.delisted',
  'datapod.price_updated',
];

export const PURCHASE_EVENTS = [
  'purchase.created',
  'purchase.completed',
  'purchase.failed',
];

export const PAYMENT_EVENTS = [
  'payment.released',
  'payment.failed',
];

export const REVIEW_EVENTS = [
  'review.added',
  'review.updated',
  'review.deleted',
];

/**
 * All available events
 */
export const ALL_EVENTS = [
  ...MARKETPLACE_EVENTS,
  ...PURCHASE_EVENTS,
  ...PAYMENT_EVENTS,
  ...REVIEW_EVENTS,
];
