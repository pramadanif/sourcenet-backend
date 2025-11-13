import swaggerJsdoc from 'swagger-jsdoc';
import { swaggerPaths, websocketDocs } from './swagger-docs';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SourceNet API Documentation',
      version: '1.0.0',
      description: 'Decentralized Data Marketplace Backend API',
    },
    servers: [
      {
        url: 'http://localhost:3001/api',
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        AuthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'object' },
          },
        },
      },
    },
    paths: swaggerPaths,
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);