import WebSocket, { Server as WebSocketServer, PerMessageDeflateOptions } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { WebSocketBroadcaster, WebSocketClient, BroadcastMessage } from './websocket.broadcaster';

export interface ConnectedClient extends WebSocketClient {
  ws: WebSocket;
  subscriptions: Set<string>;
  connectedAt: Date;
  lastHeartbeat: Date;
}

interface JWTPayload {
  address: string;
  email?: string;
  zkloginAddress?: string;
  iat: number;
  exp: number;
}

/**
 * WebSocket server for real-time marketplace updates
 */
export class WebSocketServerManager {
  private wsServer: WebSocketServer | null = null;
  private httpServer: any = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private broadcaster: WebSocketBroadcaster;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private messageCount: number = 0;
  private errorCount: number = 0;

  constructor(broadcaster: WebSocketBroadcaster) {
    this.broadcaster = broadcaster;
  }

  /**
   * Initialize and start WebSocket server
   */
  async start(): Promise<void> {
    try {
      const WS_PORT = env.WS_PORT || 3002;

      // Create HTTP server for WebSocket
      this.httpServer = createServer();

      // Create WebSocket server
      this.wsServer = new WebSocketServer({
        server: this.httpServer,
        maxPayload: 1024 * 1024, // 1MB max frame size
        perMessageDeflate: {
          clientNoContextTakeover: true,
          serverNoContextTakeover: true,
          serverMaxWindowBits: 15,
          concurrencyLimit: 10,
        },
      });

      // Handle new connections
      this.wsServer.on('connection', (ws: WebSocket, req: any) => {
        this.handleConnection(ws, req);
      });

      // Start heartbeat
      this.startHeartbeat();

      // Start metrics collection
      this.startMetrics();

      // Start HTTP server
      this.httpServer.listen(WS_PORT, () => {
        logger.info(`WebSocket server running on port ${WS_PORT}`);
      });
    } catch (error) {
      logger.error('Failed to start WebSocket server', { error });
      throw error;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any): void {
    try {
      const clientId = uuidv4();
      const token = this.extractToken(req);

      // Verify JWT token
      if (!token) {
        logger.warn('WebSocket connection rejected: missing token', { clientId });
        ws.close(1008, 'Unauthorized: missing token');
        return;
      }

      let decoded: JWTPayload;
      try {
        decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
      } catch (error) {
        logger.warn('WebSocket connection rejected: invalid token', { clientId, error });
        ws.close(1008, 'Unauthorized: invalid token');
        return;
      }

      // Create client object
      const client: ConnectedClient = {
        id: clientId,
        userId: decoded.address,
        address: decoded.address,
        ws,
        subscriptions: new Set(),
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        send: (message: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        },
      };

      // Register client
      this.clients.set(clientId, client);
      this.broadcaster.registerClient(client);

      logger.info('WebSocket client connected', {
        clientId,
        address: decoded.address,
        totalClients: this.clients.size,
      });

      // Send connection confirmation
      this.sendMessage(ws, {
        type: 'connection.established',
        data: { clientId, address: decoded.address },
        timestamp: new Date(),
        eventId: uuidv4(),
      });

      // Handle messages
      ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(clientId, data);
      });

      // Handle close
      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        logger.error('WebSocket error', { clientId, error: error.message });
        this.errorCount++;
      });
    } catch (error) {
      logger.error('Failed to handle WebSocket connection', { error });
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(clientId: string, data: WebSocket.Data): void {
    try {
      const client = this.clients.get(clientId);
      if (!client) {
        logger.warn('Message from unknown client', { clientId });
        return;
      }

      const message = JSON.parse(data.toString());
      this.messageCount++;

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, message);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message);
          break;

        case 'ping':
          this.handlePing(clientId);
          break;

        default:
          logger.warn('Unknown message type', { clientId, type: message.type });
      }
    } catch (error) {
      logger.error('Failed to handle message', { clientId, error });
      this.errorCount++;
    }
  }

  /**
   * Handle subscribe message
   */
  private handleSubscribe(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const events = message.events || [];
    events.forEach((event: string) => {
      client.subscriptions.add(event);
    });

    logger.debug('Client subscribed to events', {
      clientId,
      events,
      totalSubscriptions: client.subscriptions.size,
    });

    // Send confirmation
    this.sendMessage(client.ws, {
      type: 'subscription.confirmed',
      data: { events, totalSubscriptions: client.subscriptions.size },
      timestamp: new Date(),
      eventId: uuidv4(),
    });
  }

  /**
   * Handle unsubscribe message
   */
  private handleUnsubscribe(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const events = message.events || [];
    events.forEach((event: string) => {
      client.subscriptions.delete(event);
    });

    logger.debug('Client unsubscribed from events', {
      clientId,
      events,
      totalSubscriptions: client.subscriptions.size,
    });

    // Send confirmation
    this.sendMessage(client.ws, {
      type: 'unsubscription.confirmed',
      data: { events, totalSubscriptions: client.subscriptions.size },
      timestamp: new Date(),
      eventId: uuidv4(),
    });
  }

  /**
   * Handle ping message
   */
  private handlePing(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastHeartbeat = new Date();

    this.sendMessage(client.ws, {
      type: 'pong',
      data: { timestamp: new Date().toISOString() },
      timestamp: new Date(),
      eventId: uuidv4(),
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);
    this.broadcaster.unregisterClient(clientId);

    logger.info('WebSocket client disconnected', {
      clientId,
      address: client.address,
      connectedDuration: Date.now() - client.connectedAt.getTime(),
      totalClients: this.clients.size,
    });
  }

  /**
   * Send message to WebSocket
   */
  private sendMessage(ws: WebSocket, message: BroadcastMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      for (const [clientId, client] of this.clients.entries()) {
        if (now - client.lastHeartbeat.getTime() > timeout) {
          logger.warn('Client heartbeat timeout', { clientId });
          client.ws.close(1000, 'Heartbeat timeout');
          this.handleDisconnect(clientId);
        } else {
          // Send ping
          this.sendMessage(client.ws, {
            type: 'ping',
            data: {},
            timestamp: new Date(),
            eventId: uuidv4(),
          });
        }
      }
    }, 15000); // Check every 15 seconds
  }

  /**
   * Start metrics collection
   */
  private startMetrics(): void {
    this.metricsInterval = setInterval(() => {
      logger.debug('WebSocket metrics', {
        connectedClients: this.clients.size,
        messagesProcessed: this.messageCount,
        errors: this.errorCount,
      });

      // Reset counters
      this.messageCount = 0;
      this.errorCount = 0;
    }, 60000); // Log every 60 seconds
  }

  /**
   * Extract JWT token from request
   */
  private extractToken(req: any): string | null {
    const url = req.url || '';
    const match = url.match(/token=([^&]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return null;
  }

  /**
   * Get server status
   */
  getStatus(): {
    connectedClients: number;
    isRunning: boolean;
    uptime: number;
  } {
    return {
      connectedClients: this.clients.size,
      isRunning: this.wsServer !== null,
      uptime: process.uptime(),
    };
  }

  /**
   * Shutdown WebSocket server
   */
  async shutdown(): Promise<void> {
    try {
      // Clear intervals
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      // Close all client connections
      for (const client of this.clients.values()) {
        client.ws.close(1000, 'Server shutting down');
      }

      // Close WebSocket server
      if (this.wsServer) {
        this.wsServer.close();
      }

      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close();
      }

      logger.info('WebSocket server shut down');
    } catch (error) {
      logger.error('Error during WebSocket shutdown', { error });
    }
  }
}
