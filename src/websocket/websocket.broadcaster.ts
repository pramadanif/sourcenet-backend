import { EventEmitter } from 'eventemitter3';
import { logger } from '@/utils/logger';
import { ParsedEvent } from '@/indexer/listeners/event-listener';
import { parseDataPodPublished } from '@/indexer/parsers/datapod-parser';
import { parsePurchaseRequestCreated, parsePurchaseCompleted } from '@/indexer/parsers/purchase-parser';
import { parsePaymentReleased } from '@/indexer/parsers/payment-parser';
import { parseReviewAdded } from '@/indexer/parsers/review-parser';
import { parseDataPodDelisted } from '@/indexer/parsers/delisting-parser';

export interface BroadcastMessage {
  type: string;
  data: any;
  timestamp: Date;
  eventId: string;
}

export interface WebSocketClient {
  id: string;
  send: (message: string) => void;
  userId?: string;
  address?: string;
}

/**
 * WebSocket broadcaster for real-time event distribution
 * Emits events to connected frontend clients
 */
export class WebSocketBroadcaster extends EventEmitter {
  private clients: Map<string, WebSocketClient> = new Map();
  private eventLog: BroadcastMessage[] = [];
  private maxLogSize: number = 1000;

  constructor() {
    super();
  }

  /**
   * Register a websocket client
   */
  registerClient(client: WebSocketClient): void {
    this.clients.set(client.id, client);
    logger.debug('WebSocket client registered', { clientId: client.id, totalClients: this.clients.size });
  }

  /**
   * Unregister a websocket client
   */
  unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
    logger.debug('WebSocket client unregistered', { clientId, totalClients: this.clients.size });
  }

  /**
   * Broadcast parsed event to all connected clients
   */
  async broadcastEvent(event: ParsedEvent): Promise<void> {
    try {
      const message = this.transformEventToMessage(event);
      if (!message) {
        return;
      }

      // Log event
      this.logEvent(message);

      // Broadcast to all clients
      this.broadcast(message);

      // Emit for internal listeners
      this.emit('event-broadcasted', message);
    } catch (error) {
      logger.error('Failed to broadcast event', { error, eventType: event.type });
    }
  }

  /**
   * Transform parsed event to broadcast message
   */
  private transformEventToMessage(event: ParsedEvent): BroadcastMessage | null {
    try {
      switch (event.type) {
        case 'datapod.published': {
          const parsed = parseDataPodPublished(event.data);
          if (!parsed) return null;

          return {
            type: 'datapod.published',
            data: {
              datapod_id: parsed.datapod_id,
              title: parsed.title,
              category: parsed.category,
              price_sui: parsed.price_sui,
              seller_address: parsed.seller_address,
              kiosk_id: parsed.kiosk_id,
            },
            timestamp: new Date(event.timestamp),
            eventId: event.eventId,
          };
        }

        case 'datapod.delisted': {
          const parsed = parseDataPodDelisted(event.data);
          if (!parsed) return null;

          return {
            type: 'datapod.delisted',
            data: {
              datapod_id: parsed.datapod_id,
              seller_address: parsed.seller_address,
            },
            timestamp: new Date(event.timestamp),
            eventId: event.eventId,
          };
        }

        case 'purchase.created': {
          const parsed = parsePurchaseRequestCreated(event.data);
          if (!parsed) return null;

          return {
            type: 'purchase.created',
            data: {
              purchase_id: parsed.purchase_id,
              datapod_id: parsed.datapod_id,
              buyer_address: parsed.buyer_address,
              seller_address: parsed.seller_address,
              price_sui: parsed.price_sui,
            },
            timestamp: new Date(event.timestamp),
            eventId: event.eventId,
          };
        }

        case 'purchase.completed': {
          const parsed = parsePurchaseCompleted(event.data);
          if (!parsed) return null;

          return {
            type: 'purchase.completed',
            data: {
              purchase_id: parsed.purchase_id,
              datapod_id: parsed.datapod_id,
              buyer_address: parsed.buyer_address,
              seller_address: parsed.seller_address,
              status: 'completed',
            },
            timestamp: new Date(event.timestamp),
            eventId: event.eventId,
          };
        }

        case 'payment.released': {
          const parsed = parsePaymentReleased(event.data);
          if (!parsed) return null;

          return {
            type: 'payment.released',
            data: {
              seller_address: parsed.seller_address,
              amount_sui: parsed.amount_sui,
              purchase_id: parsed.purchase_id,
            },
            timestamp: new Date(event.timestamp),
            eventId: event.eventId,
          };
        }

        case 'review.added': {
          const parsed = parseReviewAdded(event.data);
          if (!parsed) return null;

          return {
            type: 'review.added',
            data: {
              datapod_id: parsed.datapod_id,
              buyer_address: parsed.buyer_address,
              rating: parsed.rating,
              comment: parsed.comment,
            },
            timestamp: new Date(event.timestamp),
            eventId: event.eventId,
          };
        }

        default:
          logger.warn('Unknown event type for broadcasting', { type: event.type });
          return null;
      }
    } catch (error) {
      logger.error('Failed to transform event to message', { error, eventType: event.type });
      return null;
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: BroadcastMessage): void {
    const payload = JSON.stringify(message);
    let successCount = 0;
    let failureCount = 0;

    for (const client of this.clients.values()) {
      try {
        client.send(payload);
        successCount++;
      } catch (error) {
        logger.warn('Failed to send message to client', { clientId: client.id, error });
        failureCount++;
      }
    }

    if (failureCount > 0) {
      logger.debug('Broadcast completed with failures', {
        successCount,
        failureCount,
        totalClients: this.clients.size,
      });
    }
  }

  /**
   * Broadcast to specific user
   */
  broadcastToUser(userId: string, message: BroadcastMessage): void {
    const payload = JSON.stringify(message);

    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        try {
          client.send(payload);
        } catch (error) {
          logger.warn('Failed to send message to user', { userId, clientId: client.id, error });
        }
      }
    }
  }

  /**
   * Broadcast to specific address
   */
  broadcastToAddress(address: string, message: BroadcastMessage): void {
    const payload = JSON.stringify(message);

    for (const client of this.clients.values()) {
      if (client.address === address) {
        try {
          client.send(payload);
        } catch (error) {
          logger.warn('Failed to send message to address', { address, clientId: client.id, error });
        }
      }
    }
  }

  /**
   * Log event for debugging
   */
  private logEvent(message: BroadcastMessage): void {
    this.eventLog.push(message);

    // Keep log size manageable
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): BroadcastMessage[] {
    return this.eventLog.slice(-limit);
  }

  /**
   * Get broadcaster status
   */
  getStatus(): {
    connectedClients: number;
    eventLogSize: number;
  } {
    return {
      connectedClients: this.clients.size,
      eventLogSize: this.eventLog.length,
    };
  }
}
