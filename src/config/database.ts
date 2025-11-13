import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

let prisma: PrismaClient;

const prismaConfig: any = {
  log: process.env.NODE_ENV === 'production' ? [] : ['query'],
};

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient(prismaConfig);
} else {
  // Reuse connection in development to avoid connection pool exhaustion
  if (!global.prisma) {
    global.prisma = new PrismaClient(prismaConfig);
  }
  prisma = global.prisma;
}

// Handle query logging
(prisma.$on as any)('query', (e: any) => {
  if (process.env.NODE_ENV === 'development') {
    logger.debug('Prisma query', { query: e.query, duration: e.duration });
  }
});

// Log Prisma initialization
logger.info('Prisma client initialized', {
  environment: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing',
});

// Test database connection asynchronously (non-blocking)
if (process.env.NODE_ENV === 'development') {
  setImmediate(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.info('✅ Database connection successful');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn('⚠️ Database connection unavailable', {
        error: errorMsg,
        databaseUrl: process.env.DATABASE_URL?.substring(0, 50) + '***',
        hint: 'Check if Supabase is running and network is accessible',
      });
    }
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default prisma;

// Extend global type for development
declare global {
  var prisma: PrismaClient | undefined;
}
