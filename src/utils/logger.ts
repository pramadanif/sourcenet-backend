import winston from 'winston';
import 'winston-daily-rotate-file';
import { env } from '@/config/env';

const isDevelopment = env.NODE_ENV === 'development';

const baseFormat = [
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
];

const devFormat = winston.format.combine(
  ...baseFormat,
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const stack = info.stack ? `\n${info.stack}` : '';
    const context = info.context ? ` ${JSON.stringify(info.context)}` : '';
    return `${info.timestamp} [${info.level}] ${info.message}${context}${stack}`;
  }),
);

const prodFormat = winston.format.combine(...baseFormat, winston.format.json());

const transports: any[] = [
  new winston.transports.Console({
    format: isDevelopment ? devFormat : prodFormat,
    level: env.LOG_LEVEL,
  }),
];

if (!isDevelopment) {
  // Use require to access DailyRotateFile from winston-daily-rotate-file
  const DailyRotateFile = require('winston-daily-rotate-file');
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: 14,
      format: prodFormat,
    }),
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: 30,
      format: prodFormat,
    }),
  );
}

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: isDevelopment ? devFormat : prodFormat,
  defaultMeta: {
    service: env.API_NAME,
    version: env.API_VERSION,
    environment: env.NODE_ENV,
  },
  transports,
});

logger.exceptions.handle(
  new winston.transports.File({ filename: 'logs/exceptions.log', format: prodFormat }),
);

logger.rejections.handle(
  new winston.transports.File({ filename: 'logs/rejections.log', format: prodFormat }),
);
