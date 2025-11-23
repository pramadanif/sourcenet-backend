import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import prisma from '@/config/database';
import OpenAI from 'openai';

export interface ChatContext {
    dataPodId?: string;
    page?: string;
}

export interface ChatRequest {
    message: string;
    conversationId?: string;
    context?: ChatContext;
}

export interface PaginationQuery {
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'updatedAt';
    order?: 'asc' | 'desc';
}

export class AiService {
    private openai: OpenAI;
    private readonly systemPrompt: string;

    constructor() {
        const apiKey = env.OPENAI_API_KEY;
        if (!apiKey) {
            logger.warn('OPENAI_API_KEY is not set. AI features will not work.');
        }

        this.openai = new OpenAI({
            apiKey: apiKey,
            baseURL: env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
        });

        this.systemPrompt = `
You are SourceNet AI, an intelligent assistant for the SourceNet platform - a decentralized data marketplace built on the Sui blockchain.

Your role is to help users:
1. Understand how to buy and sell DataPods (encrypted data packages)
2. Navigate the platform features
{{ ... }}
- Make up information about specific DataPods
- Provide financial advice
- Share private user information
- Execute transactions on behalf of users
`;
    }

    private async resolveUser(identifier: string) {
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { walletAddress: identifier },
                    { zkloginAddress: identifier },
                ],
            },
        });

        if (!user) {
            throw new Error('User not found');
        }
        return user;
    }

    async chat(userIdentifier: string, dto: ChatRequest) {
        const user = await this.resolveUser(userIdentifier);
        const userId = user.id;
        const { message, conversationId, context } = dto;

        if (!message || message.trim() === '') {
            throw new Error('Message cannot be empty');
        }

        let conversation;

        // 1. Get or Create Conversation
        if (conversationId) {
            conversation = await prisma.aiConversation.findUnique({
                where: { id: conversationId },
                include: { messages: { orderBy: { createdAt: 'asc' } } },
            });

            if (!conversation) {
                throw new Error('Conversation not found');
            }

            if (conversation.userId !== userId) {
                throw new Error('Conversation not found'); // Security
            }
        } else {
            // Generate title
            const title = message.length > 50 ? message.substring(0, 47) + '...' : message;

            conversation = await prisma.aiConversation.create({
                data: {
                    userId,
                    title,
                },
                include: { messages: true },
            });
        }

        // 2. Prepare Context
        let systemMessage = this.systemPrompt;
        if (context?.dataPodId) {
            const dataPod = await prisma.dataPod.findUnique({
                where: { id: context.dataPodId },
                include: { seller: true },
            });

            if (dataPod) {
                systemMessage += `\n\nUser is viewing DataPod:
- Title: ${dataPod.title}
- Description: ${dataPod.description || 'N/A'}
- Category: ${dataPod.category}
- Price: ${dataPod.priceSui} SUI
- Seller: ${dataPod.seller.username || 'Unknown'}
`;
            }
        }

        // 3. Prepare Messages for OpenAI
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemMessage },
            ...conversation.messages.map((m: any) => ({
                role: m.role as 'user' | 'assistant' | 'system',
                content: m.content,
            })),
            { role: 'user', content: message },
        ];

        // 4. Call OpenAI
        try {
            const completion = await this.openai.chat.completions.create({
                messages,
                model: env.OPENAI_MODEL || 'deepseek/deepseek-v3.2-exp',
                max_tokens: env.OPENAI_MAX_TOKENS || 1000,
                temperature: env.OPENAI_TEMPERATURE || 0.7,
            });

            const aiResponse = completion.choices[0].message.content || "I'm sorry, I couldn't generate a response.";
            const tokensUsed = completion.usage?.total_tokens || 0;

            // 5. Save Messages
            await prisma.$transaction([
                prisma.aiMessage.create({
                    data: {
                        conversationId: conversation.id,
                        role: 'user',
                        content: message,
                        context: context ? (context as any) : undefined,
                    },
                }),
                prisma.aiMessage.create({
                    data: {
                        conversationId: conversation.id,
                        role: 'assistant',
                        content: aiResponse,
                        tokensUsed,
                    },
                }),
                prisma.aiConversation.update({
                    where: { id: conversation.id },
                    data: { updatedAt: new Date() },
                }),
            ]);

            return {
                success: true,
                data: {
                    conversationId: conversation.id,
                    message: aiResponse,
                    timestamp: new Date().toISOString(),
                    tokens: {
                        total: tokensUsed,
                    },
                },
            };

        } catch (error) {
            logger.error('OpenAI API Error', error);
            throw new Error('Failed to get response from AI provider');
        }
    }

    async getConversations(userIdentifier: string, query: PaginationQuery) {
        const user = await this.resolveUser(userIdentifier);
        const userId = user.id;
        const { page = 1, limit = 20, sortBy = 'updatedAt', order = 'desc' } = query;
        const skip = (page - 1) * limit;

        const [conversations, total] = await prisma.$transaction([
            prisma.aiConversation.findMany({
                where: { userId },
                skip,
                take: limit,
                orderBy: { [sortBy]: order },
                include: {
                    messages: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                    _count: {
                        select: { messages: true },
                    },
                },
            }),
            prisma.aiConversation.count({ where: { userId } }),
        ]);

        return {
            success: true,
            data: {
                conversations: conversations.map((c: any) => ({
                    id: c.id,
                    title: c.title,
                    lastMessage: c.messages[0]?.content.substring(0, 100) || '',
                    createdAt: c.createdAt,
                    updatedAt: c.updatedAt,
                    messageCount: c._count.messages,
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            },
        };
    }

    async getConversation(userIdentifier: string, conversationId: string) {
        const user = await this.resolveUser(userIdentifier);
        const userId = user.id;

        const conversation = await prisma.aiConversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!conversation) {
            throw new Error('Conversation not found');
        }

        if (conversation.userId !== userId) {
            throw new Error('Conversation not found');
        }

        return {
            success: true,
            data: {
                conversation: {
                    id: conversation.id,
                    title: conversation.title,
                    createdAt: conversation.createdAt,
                    updatedAt: conversation.updatedAt,
                    messages: conversation.messages.map((m: any) => ({
                        id: m.id,
                        role: m.role,
                        content: m.content,
                        timestamp: m.createdAt,
                    })),
                },
            },
        };
    }

    async deleteConversation(userIdentifier: string, conversationId: string) {
        const user = await this.resolveUser(userIdentifier);
        const userId = user.id;

        const conversation = await prisma.aiConversation.findUnique({
            where: { id: conversationId },
        });

        if (!conversation) {
            throw new Error('Conversation not found');
        }

        if (conversation.userId !== userId) {
            throw new Error('Conversation not found');
        }

        await prisma.aiConversation.delete({
            where: { id: conversationId },
        });

        return {
            success: true,
            message: 'Conversation deleted successfully',
        };
    }
}

export const aiService = new AiService();
