import { logger } from '@/utils/logger';
import { env } from './env';

/**
 * Walrus configuration for blob storage
 */
export const walrusConfig = {
  // API endpoints
  apiUrl: env.WALRUS_API_URL,
  blobEndpoint: env.WALRUS_BLOB_ENDPOINT,

  // Upload settings
  upload: {
    maxSizeBytes: 100 * 1024 * 1024, // 100 MB
    chunkSizeBytes: 1024 * 1024, // 1 MB chunks
    timeoutMs: 60000, // 60 seconds
    retries: 3,
  },

  // Download settings
  download: {
    timeoutMs: 30000, // 30 seconds
    retries: 3,
  },

  // Encoding
  encoding: 'base64',

  // Retry settings
  retryDelayMs: 1000,
  maxRetries: 3,
};

/**
 * Validate Walrus configuration
 */
export function validateWalrusConfig(): boolean {
  if (!env.WALRUS_API_URL) {
    logger.error('WALRUS_API_URL not configured');
    return false;
  }

  if (!env.WALRUS_BLOB_ENDPOINT) {
    logger.error('WALRUS_BLOB_ENDPOINT not configured');
    return false;
  }

  logger.info('Walrus configuration validated', {
    apiUrl: env.WALRUS_API_URL,
    blobEndpoint: env.WALRUS_BLOB_ENDPOINT,
  });

  return true;
}

export default walrusConfig;
