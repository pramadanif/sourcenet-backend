import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  API_NAME: z.string().default('SourceNet Backend'),
  API_VERSION: z.string().default('1.0.0'),
  CORS_ORIGINS: z.string().default('*'),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().default(20),
  DATABASE_POOL_MIN: z.coerce.number().default(2),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),

  // Blockchain (Sui)
  SUI_RPC_URL: z.string().url(),
  SUI_NETWORK: z.enum(['testnet', 'mainnet', 'devnet']).default('testnet'),
  SUI_SPONSOR_ADDRESS: z.string(),
  SUI_SPONSOR_PRIVATE_KEY: z.string(),
  SOURCENET_PACKAGE_ID: z.string(),

  // Walrus
  WALRUS_API_URL: z.string().url(),
  WALRUS_BLOB_ENDPOINT: z.string().url(),

  // // AWS S3
  // AWS_REGION: z.string().default('us-east-1'),
  // AWS_ACCESS_KEY_ID: z.string(),
  // AWS_SECRET_ACCESS_KEY: z.string(),
  // S3_BUCKET_NAME: z.string(),
  // S3_ENDPOINT: z.string().url().optional(),
  // S3_USE_PATH_STYLE: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),

  // WebSocket
  WS_PORT: z.coerce.number().default(3002),
  WS_URL: z.string().url().default('ws://localhost:3002'),

  // Security & JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('7d'),

  // ZKLogin
  ZKLOGIN_CLIENT_ID: z.string(),
  ZKLOGIN_REDIRECT_URI: z.string().url(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SENTRY_DSN: z.string().url().optional(),
});

export type Environment = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

console.log(`✅ Environment loaded: ${env.NODE_ENV}`);
