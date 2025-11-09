import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import routes from '@/routes';
import { startFulfillmentWorker, shutdownFulfillmentQueue } from '@/jobs/fulfillment.job';
import { BlockchainService } from '@/services/blockchain.service';
import { CacheService } from '@/services/cache.service';
import { WebSocketServerManager } from '@/websocket/websocket.server';
import { WebSocketBroadcaster } from '@/websocket/websocket.broadcaster';

const app = express();
const PORT = env.PORT || 3000;

// Initialize WebSocket broadcaster and server
const broadcaster = new WebSocketBroadcaster();
let wsServer: WebSocketServerManager | null = null;

// Middleware
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGINS.split(','),
  credentials: true,
}));
app.use(morgan('combined', { stream: { write: (msg: string) => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request ID middleware
app.use((req: Request, res: Response, next: NextFunction): void => {
  (req as any).requestId = uuidv4();
  res.setHeader('X-Request-ID', (req as any).requestId);
  next();
});

// Declare request ID on Express Request
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

// Routes
app.use('/api', routes);

// Health check endpoint
app.get('/health', (req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404 handler
app.use((req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      statusCode: 404,
      requestId: req.requestId,
    },
  });
});

// Error handler
app.use((error: any, req: Request, res: Response, next: NextFunction): void => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    requestId: req.requestId,
  });

  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_SERVER_ERROR';

  res.status(statusCode).json({
    error: {
      code,
      message: error.message || 'Internal server error',
      statusCode,
      requestId: req.requestId,
    },
  });
});

// Initialize services and start server
const startServer = async () => {
  try {
    // Initialize Sui client
    BlockchainService.initializeSuiClient();
    logger.info('Blockchain service initialized');

    // Initialize Redis
    CacheService.initializeRedis();
    logger.info('Cache service initialized');

    // Start fulfillment worker
    await startFulfillmentWorker();
    logger.info('Fulfillment worker started');

    // Start WebSocket server
    wsServer = new WebSocketServerManager(broadcaster);
    await wsServer.start();
    logger.info('WebSocket server started');

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (wsServer) {
    await wsServer.shutdown();
  }
  await shutdownFulfillmentQueue();
  await CacheService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  if (wsServer) {
    await wsServer.shutdown();
  }
  await shutdownFulfillmentQueue();
  await CacheService.disconnect();
  process.exit(0);
});

// Start the server
startServer();

export { app, broadcaster, wsServer };
export default app;
