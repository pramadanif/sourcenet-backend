# AI Chat Integration Guide for Frontend

This guide provides comprehensive instructions for integrating the SourceNet AI Chat API into your frontend application.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
- [TypeScript Types](#typescript-types)
- [Usage Examples](#usage-examples)
- [React Integration](#react-integration)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Best Practices](#best-practices)

## Overview

The SourceNet AI Chat API provides intelligent assistance for users navigating the SourceNet platform. It supports:

- **Conversational AI**: Multi-turn conversations with context awareness
- **DataPod Context**: Provide context about specific DataPods for targeted assistance
- **Conversation Management**: Create, retrieve, and delete conversation history
- **Token Tracking**: Monitor AI token usage for each response

**Base URL**: `http://localhost:3001/api` (development) or your production API URL

## Authentication

All AI endpoints require authentication via JWT Bearer token.

### Headers Required

```typescript
{
  'Authorization': 'Bearer YOUR_JWT_TOKEN',
  'Content-Type': 'application/json'
}
```

The JWT token should contain:
- `address`: User's wallet address
- `zkloginAddress`: User's ZK Login address
- `email`: User's email (optional)

## API Endpoints

### 1. Send Chat Message

Send a message to the AI and receive a response.

**Endpoint**: `POST /api/ai/chat`

**Request Body**:
```typescript
{
  message: string;              // Required: The user's message
  conversationId?: string;      // Optional: Continue existing conversation
  context?: {                   // Optional: Provide context
    dataPodId?: string;         // ID of DataPod being viewed
    page?: string;              // Current page/section
  };
}
```

**Response**:
```typescript
{
  success: true,
  data: {
    conversationId: string;     // ID to continue this conversation
    message: string;            // AI's response
    timestamp: string;          // ISO 8601 timestamp
    tokens: {
      total: number;            // Total tokens used in this request
    }
  }
}
```

**Example**:
```typescript
const response = await fetch('http://localhost:3001/api/ai/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: 'How do I create a DataPod?',
    context: {
      page: 'seller-dashboard'
    }
  })
});

const data = await response.json();
console.log(data.data.message); // AI response
console.log(data.data.conversationId); // Save for follow-up
```

---

### 2. Get All Conversations

Retrieve a paginated list of user's conversations.

**Endpoint**: `GET /api/ai/conversations`

**Query Parameters**:
```typescript
{
  page?: number;        // Default: 1
  limit?: number;       // Default: 20, Max: 100
  sortBy?: 'createdAt' | 'updatedAt';  // Default: 'updatedAt'
  order?: 'asc' | 'desc';              // Default: 'desc'
}
```

**Response**:
```typescript
{
  success: true,
  data: {
    conversations: [
      {
        id: string;
        title: string;              // First message (truncated)
        lastMessage: string;        // Last message preview (100 chars)
        createdAt: string;          // ISO 8601
        updatedAt: string;          // ISO 8601
        messageCount: number;       // Total messages in conversation
      }
    ],
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    }
  }
}
```

**Example**:
```typescript
const response = await fetch(
  'http://localhost:3001/api/ai/conversations?page=1&limit=10',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  }
);

const data = await response.json();
console.log(data.data.conversations); // Array of conversations
```

---

### 3. Get Single Conversation

Retrieve all messages from a specific conversation.

**Endpoint**: `GET /api/ai/conversations/:id`

**Response**:
```typescript
{
  success: true,
  data: {
    conversation: {
      id: string;
      title: string;
      createdAt: string;
      updatedAt: string;
      messages: [
        {
          id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          timestamp: string;
        }
      ]
    }
  }
}
```

**Example**:
```typescript
const conversationId = '50d1a38f-2e48-4a3c-b784-f0a1f6959b2d';
const response = await fetch(
  `http://localhost:3001/api/ai/conversations/${conversationId}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  }
);

const data = await response.json();
console.log(data.data.conversation.messages); // Full message history
```

---

### 4. Delete Conversation

Delete a conversation and all its messages.

**Endpoint**: `DELETE /api/ai/conversations/:id`

**Response**:
```typescript
{
  success: true,
  message: 'Conversation deleted successfully'
}
```

**Example**:
```typescript
const conversationId = '50d1a38f-2e48-4a3c-b784-f0a1f6959b2d';
const response = await fetch(
  `http://localhost:3001/api/ai/conversations/${conversationId}`,
  {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    }
  }
);

const data = await response.json();
console.log(data.message); // 'Conversation deleted successfully'
```

---

## TypeScript Types

Create these types in your frontend project:

```typescript
// types/ai.ts

export interface ChatContext {
  dataPodId?: string;
  page?: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  context?: ChatContext;
}

export interface ChatResponse {
  success: true;
  data: {
    conversationId: string;
    message: string;
    timestamp: string;
    tokens: {
      total: number;
    };
  };
}

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationsResponse {
  success: true;
  data: {
    conversations: ConversationSummary[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export interface ConversationResponse {
  success: true;
  data: {
    conversation: ConversationDetail;
  };
}

export interface DeleteResponse {
  success: true;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
```

---

## Usage Examples

### API Service Class

Create a reusable service for AI API calls:

```typescript
// services/ai.service.ts

import type {
  ChatRequest,
  ChatResponse,
  ConversationsResponse,
  ConversationResponse,
  DeleteResponse,
  ErrorResponse,
} from '@/types/ai';

class AiService {
  private baseUrl: string;
  private getToken: () => string | null;

  constructor(baseUrl: string, getToken: () => string | null) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error.message || 'Request failed');
    }

    return response.json();
  }

  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    return this.request<ChatResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getConversations(params?: {
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'updatedAt';
    order?: 'asc' | 'desc';
  }): Promise<ConversationsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.sortBy) queryParams.set('sortBy', params.sortBy);
    if (params?.order) queryParams.set('order', params.order);

    const query = queryParams.toString();
    return this.request<ConversationsResponse>(
      `/ai/conversations${query ? `?${query}` : ''}`
    );
  }

  async getConversation(id: string): Promise<ConversationResponse> {
    return this.request<ConversationResponse>(`/ai/conversations/${id}`);
  }

  async deleteConversation(id: string): Promise<DeleteResponse> {
    return this.request<DeleteResponse>(`/ai/conversations/${id}`, {
      method: 'DELETE',
    });
  }
}

// Export singleton instance
export const aiService = new AiService(
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  () => localStorage.getItem('authToken') // Adjust based on your auth implementation
);
```

---

## React Integration

### Custom Hook for AI Chat

```typescript
// hooks/useAiChat.ts

import { useState, useCallback } from 'react';
import { aiService } from '@/services/ai.service';
import type { Message, ChatContext } from '@/types/ai';

export function useAiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (message: string, context?: ChatContext) => {
      setIsLoading(true);
      setError(null);

      // Add user message optimistically
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const response = await aiService.sendMessage({
          message,
          conversationId: conversationId || undefined,
          context,
        });

        // Update conversation ID if this is a new conversation
        if (!conversationId) {
          setConversationId(response.data.conversationId);
        }

        // Add AI response
        const aiMessage: Message = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: response.data.message,
          timestamp: response.data.timestamp,
        };
        setMessages((prev) => [...prev, aiMessage]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
        // Remove optimistic user message on error
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId]
  );

  const loadConversation = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await aiService.getConversation(id);
      setConversationId(id);
      setMessages(response.data.conversation.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  return {
    messages,
    conversationId,
    isLoading,
    error,
    sendMessage,
    loadConversation,
    clearConversation,
  };
}
```

### Chat Component Example

```typescript
// components/AiChat.tsx

'use client';

import { useState } from 'react';
import { useAiChat } from '@/hooks/useAiChat';

export function AiChat() {
  const [input, setInput] = useState('');
  const { messages, isLoading, error, sendMessage } = useAiChat();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    await sendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-900'
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              <span className="text-xs opacity-70 mt-1 block">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-lg p-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2">
          {error}
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask SourceNet AI..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

### Conversation List Component

```typescript
// components/ConversationList.tsx

'use client';

import { useEffect, useState } from 'react';
import { aiService } from '@/services/ai.service';
import type { ConversationSummary } from '@/types/ai';

interface ConversationListProps {
  onSelectConversation: (id: string) => void;
}

export function ConversationList({ onSelectConversation }: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await aiService.getConversations({ limit: 50 });
      setConversations(response.data.conversations);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;

    try {
      await aiService.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading conversations...</div>;
  }

  return (
    <div className="space-y-2">
      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          onClick={() => onSelectConversation(conversation.id)}
          className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="font-medium truncate">{conversation.title}</h3>
              <p className="text-sm text-gray-500 truncate">
                {conversation.lastMessage}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {conversation.messageCount} messages •{' '}
                {new Date(conversation.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={(e) => handleDelete(conversation.id, e)}
              className="text-red-500 hover:text-red-700 ml-2"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Error Handling

### Common Error Codes

| Code | Status | Description | Action |
|------|--------|-------------|--------|
| `UNAUTHORIZED` | 401 | Missing or invalid token | Redirect to login |
| `NOT_FOUND` | 404 | Conversation not found | Show error message |
| `BAD_REQUEST` | 400 | Empty message | Validate input |
| `INTERNAL_ERROR` | 500 | Server error | Retry or show error |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Show cooldown message |

### Error Handling Example

```typescript
try {
  const response = await aiService.sendMessage({ message: 'Hello' });
  // Handle success
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('UNAUTHORIZED')) {
      // Redirect to login
      router.push('/login');
    } else if (error.message.includes('RATE_LIMIT')) {
      // Show rate limit message
      toast.error('Too many requests. Please wait a moment.');
    } else {
      // Generic error
      toast.error(error.message);
    }
  }
}
```

---

## Rate Limiting

The AI endpoints are rate-limited to prevent abuse:

- **Per IP**: 100 requests per 15 minutes
- **Per User**: 50 requests per 15 minutes

When rate limit is exceeded, you'll receive a `429 Too Many Requests` response.

### Handling Rate Limits

```typescript
const [rateLimitReset, setRateLimitReset] = useState<Date | null>(null);

try {
  await aiService.sendMessage({ message });
} catch (error) {
  if (error.message.includes('rate limit')) {
    // Set cooldown for 15 minutes
    setRateLimitReset(new Date(Date.now() + 15 * 60 * 1000));
  }
}
```

---

## Best Practices

### 1. Context Awareness

Always provide context when available to get more relevant responses:

```typescript
// When viewing a DataPod
await aiService.sendMessage({
  message: 'Is this DataPod worth buying?',
  context: {
    dataPodId: currentDataPod.id,
    page: 'datapod-detail'
  }
});
```

### 2. Conversation Continuity

Save and reuse `conversationId` for multi-turn conversations:

```typescript
const [conversationId, setConversationId] = useState<string | null>(null);

const response = await aiService.sendMessage({
  message: 'Follow-up question',
  conversationId: conversationId || undefined
});

if (!conversationId) {
  setConversationId(response.data.conversationId);
}
```

### 3. Optimistic UI Updates

Show user messages immediately for better UX:

```typescript
// Add message to UI immediately
setMessages(prev => [...prev, userMessage]);

try {
  const response = await aiService.sendMessage({ message });
  // Add AI response
  setMessages(prev => [...prev, aiResponse]);
} catch (error) {
  // Remove optimistic message on error
  setMessages(prev => prev.slice(0, -1));
}
```

### 4. Token Usage Tracking

Monitor token usage for cost management:

```typescript
const [totalTokens, setTotalTokens] = useState(0);

const response = await aiService.sendMessage({ message });
setTotalTokens(prev => prev + response.data.tokens.total);
```

### 5. Error Recovery

Implement retry logic for transient errors:

```typescript
async function sendWithRetry(message: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await aiService.sendMessage({ message });
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 6. Markdown Rendering

AI responses may contain markdown. Use a markdown renderer:

```typescript
import ReactMarkdown from 'react-markdown';

<ReactMarkdown>{message.content}</ReactMarkdown>
```

### 7. Conversation Cleanup

Implement conversation cleanup for better UX:

```typescript
// Auto-delete old conversations
const deleteOldConversations = async () => {
  const response = await aiService.getConversations();
  const oldConversations = response.data.conversations.filter(
    c => Date.now() - new Date(c.updatedAt).getTime() > 30 * 24 * 60 * 60 * 1000
  );
  
  for (const conv of oldConversations) {
    await aiService.deleteConversation(conv.id);
  }
};
```

---

## Testing

Test the integration using the provided test script:

```bash
npx ts-node scripts/test-ai-chat.ts
```

This will verify:
- ✅ Chat endpoint functionality
- ✅ Conversation creation
- ✅ Message persistence
- ✅ Authentication flow

---

## Support

For issues or questions:
- Check the [API documentation](./API_DOCS.md)
- Review error messages in browser console
- Verify authentication token is valid
- Check network requests in DevTools

---

**Last Updated**: 2025-11-24
