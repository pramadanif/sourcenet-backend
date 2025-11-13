// src/config/swagger-docs.ts
export const swaggerPaths = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Health check',
      responses: {
        '200': {
          description: 'Server is healthy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  timestamp: { type: 'string' },
                  uptime: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  },
  '/health/db': {
    get: {
      tags: ['Health'],
      summary: 'Database health check',
      responses: {
        '200': {
          description: 'Database connected',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  database: { type: 'string' },
                  timestamp: { type: 'string' },
                },
              },
            },
          },
        },
        '503': {
          description: 'Database unavailable',
        },
      },
    },
  },
  '/auth/zklogin/callback': {
    post: {
      tags: ['Auth'],
      summary: 'ZKLogin callback',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['address'],
              properties: {
                address: { type: 'string', example: '0x...' },
                email: { type: 'string' },
                username: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  '/auth/wallet/callback': {
    post: {
      tags: ['Auth'],
      summary: 'Wallet callback',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['address'],
              properties: {
                address: { type: 'string' },
                username: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Success' },
      },
    },
  },
  '/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Get current user',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'User profile' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  '/auth/profile': {
    put: {
      tags: ['Auth'],
      summary: 'Update profile',
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                username: { type: 'string' },
                bio: { type: 'string' },
                avatarUrl: { type: 'string' },
                websiteUrl: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Profile updated' },
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Logout',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Logged out' },
      },
    },
  },
  '/seller/upload': {
    post: {
      tags: ['Seller'],
      summary: 'Upload data file',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file', 'metadata'],
              properties: {
                file: { type: 'string', format: 'binary' },
                metadata: {
                  type: 'string',
                  example: '{"title":"Dataset","category":"analytics","price_sui":10.5}',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'File uploaded' },
      },
    },
  },
  '/seller/publish': {
    post: {
      tags: ['Seller'],
      summary: 'Publish DataPod',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['upload_id'],
              properties: {
                upload_id: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Published' },
      },
    },
  },
  '/seller/datapods': {
    get: {
      tags: ['Seller'],
      summary: 'Get seller DataPods',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'List of DataPods' },
      },
    },
  },
  '/seller/stats': {
    get: {
      tags: ['Seller'],
      summary: 'Get seller stats',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Seller statistics' },
      },
    },
  },
  '/buyer/purchase': {
    post: {
      tags: ['Buyer'],
      summary: 'Create purchase',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['datapod_id', 'buyer_address', 'buyer_public_key'],
              properties: {
                datapod_id: { type: 'string' },
                buyer_address: { type: 'string' },
                buyer_public_key: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Purchase created' },
      },
    },
  },
  '/buyer/purchase/{purchase_id}': {
    get: {
      tags: ['Buyer'],
      summary: 'Get purchase status',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'purchase_id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Purchase status' },
      },
    },
  },
  '/buyer/purchase/{purchase_id}/details': {
    get: {
      tags: ['Buyer'],
      summary: 'Get purchase details',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'purchase_id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Purchase details' },
      },
    },
  },
  '/buyer/download/{purchase_id}': {
    get: {
      tags: ['Buyer'],
      summary: 'Get download URL',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'purchase_id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Download URL' },
      },
    },
  },
  '/buyer/purchase/{purchase_id}/review': {
  post: {
    tags: ['Buyer'],
    summary: 'Submit review for purchase',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'purchase_id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['rating', 'comment'],
            properties: {
              rating: { type: 'integer', minimum: 1, maximum: 5 },
              comment: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'Review submitted' },
    },
  },
},
  '/marketplace/datapods': {
    get: {
      tags: ['Marketplace'],
      summary: 'Get all DataPods',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'category', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'List of DataPods' },
      },
    },
  },
  '/marketplace/browse': {
    get: {
      tags: ['Marketplace'],
      summary: 'Browse marketplace',
      responses: {
        '200': { description: 'Marketplace data' },
      },
    },
  },
  '/marketplace/search': {
    get: {
      tags: ['Marketplace'],
      summary: 'Search DataPods',
      parameters: [
        { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Search results' },
      },
    },
  },
  '/marketplace/datapods/{datapod_id}': {
    get: {
      tags: ['Marketplace'],
      summary: 'Get DataPod details',
      parameters: [
        {
          name: 'datapod_id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': { description: 'DataPod details' },
      },
    },
  },
  '/marketplace/top-rated': {
    get: {
      tags: ['Marketplace'],
      summary: 'Get top-rated DataPods',
      responses: {
        '200': { description: 'Top-rated DataPods' },
      },
    },
  },
  '/marketplace/categories': {
    get: {
      tags: ['Marketplace'],
      summary: 'Get categories',
      responses: {
        '200': { description: 'Available categories' },
      },
    },
  },
  '/review': {
    post: {
      tags: ['Review'],
      summary: 'Create review',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['datapod_id', 'rating', 'comment'],
              properties: {
                datapod_id: { type: 'string', format: 'uuid' },
                rating: { type: 'integer', minimum: 1, maximum: 5 },
                comment: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Review created' },
      },
    },
  },
  '/review/datapod/{datapodId}': {
    get: {
      tags: ['Review'],
      summary: 'Get DataPod reviews',
      parameters: [
        {
          name: 'datapodId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Reviews' },
      },
    },
  },
  '/review/my-reviews': {
    get: {
      tags: ['Review'],
      summary: 'Get my reviews',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'My reviews' },
      },
    },
  },
  '/review/{reviewId}': {
    delete: {
      tags: ['Review'],
      summary: 'Delete review',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'reviewId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Review deleted' },
      },
    },
  },
};

export const websocketDocs = {
  '/ws': {
    get: {
      tags: ['WebSocket'],
      summary: 'WebSocket connection',
      description: 'Connect to WebSocket server for real-time events',
      responses: {
        '101': {
          description: 'Switching Protocols - WebSocket connection established',
        },
      },
    },
  },
};

export const websocketEvents = {
  'datapod.published': {
    description: 'Emitted when a new DataPod is published',
    payload: {
      type: 'object',
      properties: {
        type: { type: 'string', example: 'datapod.published' },
        data: {
          type: 'object',
          properties: {
            datapod_id: { type: 'string' },
            title: { type: 'string' },
            category: { type: 'string' },
            price_sui: { type: 'number' },
            seller_address: { type: 'string' },
          },
        },
        timestamp: { type: 'number' },
        eventId: { type: 'string' },
      },
    },
  },
  'purchase.created': {
    description: 'Emitted when a purchase is created',
    payload: {
      type: 'object',
      properties: {
        type: { type: 'string', example: 'purchase.created' },
        data: {
          type: 'object',
          properties: {
            purchase_id: { type: 'string' },
            datapod_id: { type: 'string' },
            buyer_address: { type: 'string' },
            seller_address: { type: 'string' },
            price_sui: { type: 'number' },
          },
        },
        timestamp: { type: 'number' },
        eventId: { type: 'string' },
      },
    },
  },
  'purchase.completed': {
    description: 'Emitted when a purchase is completed',
    payload: {
      type: 'object',
      properties: {
        type: { type: 'string', example: 'purchase.completed' },
        data: {
          type: 'object',
          properties: {
            purchase_id: { type: 'string' },
            buyer_address: { type: 'string' },
            seller_address: { type: 'string' },
          },
        },
        timestamp: { type: 'number' },
      },
    },
  },
  'payment.released': {
    description: 'Emitted when payment is released from escrow',
    payload: {
      type: 'object',
      properties: {
        type: { type: 'string', example: 'payment.released' },
        data: {
          type: 'object',
          properties: {
            purchase_id: { type: 'string' },
            amount: { type: 'number' },
          },
        },
        timestamp: { type: 'number' },
      },
    },
  },
  'datapod.delisted': {
    description: 'Emitted when a DataPod is delisted',
    payload: {
      type: 'object',
      properties: {
        type: { type: 'string', example: 'datapod.delisted' },
        data: {
          type: 'object',
          properties: {
            datapod_id: { type: 'string' },
          },
        },
        timestamp: { type: 'number' },
      },
    },
  },
};