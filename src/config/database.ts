import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error'],
  });
} else {
  // Reuse connection in development to avoid connection pool exhaustion
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['error', 'warn'],
    });
  }
  prisma = global.prisma;
}

// Handle connection errors
prisma.$on('error', (e: any) => {
  logger.error('Prisma error', { error: e.message });
});

prisma.$on('warn', (e: any) => {
  logger.warn('Prisma warning', { warning: e.message });
});

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
