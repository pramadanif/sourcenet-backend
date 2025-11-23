import { Router } from 'express';
import { chat, getConversations, getConversation, deleteConversation } from '@/controllers/ai.controller';
import { authMiddleware } from '@/middleware/auth.middleware';
import { aiUserRateLimiter, aiIpRateLimiter } from '@/middleware/rateLimiter.middleware';

const router = Router();

// Apply auth middleware and rate limiters to all AI routes
router.use(authMiddleware);
router.use(aiIpRateLimiter);
router.use(aiUserRateLimiter);

// Chat endpoint
router.post('/chat', chat);

// Conversation management
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);

export default router;
