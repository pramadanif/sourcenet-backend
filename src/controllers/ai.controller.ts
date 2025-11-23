import { Request, Response } from 'express';
import { aiService, ChatRequest, PaginationQuery } from '@/services/ai.service';
import { logger } from '@/utils/logger';

export async function chat(req: Request, res: Response): Promise<void> {
    try {
        const userIdentifier = req.user?.address || req.user?.zkloginAddress;
        if (!userIdentifier) {
            res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
            return;
        }

        const dto: ChatRequest = req.body;
        const result = await aiService.chat(userIdentifier, dto);
        res.status(200).json(result);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('AI Chat Error', { error: errorMessage });

        if (errorMessage === 'Conversation not found') {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: errorMessage } });
        } else if (errorMessage === 'Message cannot be empty') {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: errorMessage } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } });
        }
    }
}

export async function getConversations(req: Request, res: Response): Promise<void> {
    try {
        const userIdentifier = req.user?.address || req.user?.zkloginAddress;
        if (!userIdentifier) {
            res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
            return;
        }

        const query: PaginationQuery = {
            page: req.query.page ? parseInt(req.query.page as string) : 1,
            limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
            sortBy: (req.query.sortBy as 'createdAt' | 'updatedAt') || 'updatedAt',
            order: (req.query.order as 'asc' | 'desc') || 'desc',
        };

        const result = await aiService.getConversations(userIdentifier, query);
        res.status(200).json(result);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Get Conversations Error', { error: errorMessage });
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } });
    }
}

export async function getConversation(req: Request, res: Response): Promise<void> {
    try {
        const userIdentifier = req.user?.address || req.user?.zkloginAddress;
        if (!userIdentifier) {
            res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
            return;
        }

        const { id } = req.params;
        const result = await aiService.getConversation(userIdentifier, id);
        res.status(200).json(result);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Get Conversation Error', { error: errorMessage });

        if (errorMessage === 'Conversation not found') {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: errorMessage } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } });
        }
    }
}

export async function deleteConversation(req: Request, res: Response): Promise<void> {
    try {
        const userIdentifier = req.user?.address || req.user?.zkloginAddress;
        if (!userIdentifier) {
            res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
            return;
        }

        const { id } = req.params;
        const result = await aiService.deleteConversation(userIdentifier, id);
        res.status(200).json(result);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Delete Conversation Error', { error: errorMessage });

        if (errorMessage === 'Conversation not found') {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: errorMessage } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } });
        }
    }
}
