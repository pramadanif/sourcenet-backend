import { Router, Request, Response } from 'express';

const router = Router();

// GET /health - Health check
router.get('/', (req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// GET /health/websocket - WebSocket server status
router.get('/websocket', async (req: Request, res: Response): Promise<void> => {
  try {
    // Use dynamic import to avoid circular dependency
    const { wsServer } = await import('@/main');
    
    if (!wsServer) {
      res.status(503).json({
        status: 'unavailable',
        message: 'WebSocket server not initialized',
      });
      return;
    }

    const status = wsServer.getStatus();
    res.status(200).json({
      status: 'ok',
      websocket: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      message: 'WebSocket server not available',
    });
  }
});

export default router;
