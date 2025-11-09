import { Router, Request, Response } from 'express';
import { wsServer } from '@/main';

const router = Router();

// GET /health - Health check
router.get('/', (req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// GET /health/websocket - WebSocket server status
router.get('/websocket', (req: Request, res: Response): void => {
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
});

export default router;
