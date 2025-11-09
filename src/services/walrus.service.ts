import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { WalrusError } from '@/types/errors.types';
import { retry } from '@/utils/helpers';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const REQUEST_TIMEOUT = 30000; // 30 seconds

interface WalrusBlob {
  blobId: string;
  url: string;
  size: number;
  createdAt: string;
}

/**
 * Walrus storage service for encrypted blob storage
 */
export class WalrusService {
  private static client: AxiosInstance | null = null;

  /**
   * Initialize Walrus client
   */
  static initializeWalrusClient(): AxiosInstance {
    if (this.client) {
      return this.client;
    }

    try {
      this.client = axios.create({
        baseURL: env.WALRUS_API_URL,
        timeout: REQUEST_TIMEOUT,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      logger.info('Walrus client initialized', { apiUrl: env.WALRUS_API_URL });
      return this.client;
    } catch (error) {
      logger.error('Failed to initialize Walrus client', { error });
      throw new WalrusError('Failed to initialize Walrus client');
    }
  }

  /**
   * Get Walrus client instance
   */
  static getClient(): AxiosInstance {
    if (!this.client) {
      return this.initializeWalrusClient();
    }
    return this.client;
  }

  /**
   * Upload encrypted blob to Walrus
   * Configured for high replication and long retention
   */
  static async uploadBlob(
    encryptedData: Buffer,
    metadata?: {
      name?: string;
      size?: number;
    },
  ): Promise<WalrusBlob> {
    try {
      const uploadWithRetry = async (): Promise<WalrusBlob> => {
        const client = this.getClient();

        const formData = new FormData();
        const blob = new Blob([new Uint8Array(encryptedData)], { type: 'application/octet-stream' });
        formData.append('file', blob, metadata?.name || 'data.bin');

        // Configure Walrus parameters
        formData.append('replication', '10'); // 10x replication
        formData.append('encoding', 'reed-solomon'); // Reed-Solomon encoding
        formData.append('retention', '31536000'); // 1 year in seconds

        const response = await client.post('/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        if (!response.data.blobId) {
          throw new Error('No blob ID in response');
        }

        const blobUrl = `${env.WALRUS_BLOB_ENDPOINT}/${response.data.blobId}`;

        logger.info('Blob uploaded to Walrus', {
          blobId: response.data.blobId,
          size: metadata?.size || encryptedData.length,
        });

        return {
          blobId: response.data.blobId,
          url: blobUrl,
          size: metadata?.size || encryptedData.length,
          createdAt: new Date().toISOString(),
        };
      };

      return await retry(uploadWithRetry, MAX_RETRIES, RETRY_DELAY);
    } catch (error) {
      logger.error('Failed to upload blob to Walrus', { error });
      throw new WalrusError('Failed to upload blob to Walrus storage');
    }
  }

  /**
   * Get blob from Walrus (alias for downloadBlob)
   */
  static async getBlob(blobId: string): Promise<Buffer> {
    return this.downloadBlob(blobId);
  }

  /**
   * Download encrypted blob from Walrus
   */
  static async downloadBlob(blobId: string): Promise<Buffer> {
    try {
      const downloadWithRetry = async (): Promise<Buffer> => {
        const client = this.getClient();

        // Check if blob exists first
        try {
          await client.head(`/blobs/${blobId}`);
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            throw new WalrusError(`Blob not found: ${blobId}`);
          }
          throw error;
        }

        const response = await client.get(`/blobs/${blobId}`, {
          responseType: 'arraybuffer',
        });

        logger.info('Blob downloaded from Walrus', { blobId });
        return Buffer.from(response.data);
      };

      return await retry(downloadWithRetry, MAX_RETRIES, RETRY_DELAY);
    } catch (error) {
      logger.error('Failed to download blob from Walrus', { error, blobId });
      throw new WalrusError('Failed to download blob from Walrus storage');
    }
  }

  /**
   * Get blob metadata from Walrus
   */
  static async getBlobMetadata(blobId: string): Promise<any> {
    try {
      const client = this.getClient();

      const response = await client.get(`/blobs/${blobId}/metadata`);

      logger.info('Retrieved blob metadata', { blobId });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn('Blob metadata not found', { blobId });
        throw new WalrusError(`Blob not found: ${blobId}`);
      }

      logger.error('Failed to get blob metadata', { error, blobId });
      throw new WalrusError('Failed to fetch blob metadata from Walrus');
    }
  }

  /**
   * Delete blob from Walrus (if supported)
   */
  static async deleteBlob(blobId: string): Promise<void> {
    try {
      const client = this.getClient();

      await client.delete(`/blobs/${blobId}`);

      logger.info('Blob deleted from Walrus', { blobId });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn('Blob not found for deletion', { blobId });
        return; // Already deleted
      }

      logger.error('Failed to delete blob from Walrus', { error, blobId });
      throw new WalrusError('Failed to delete blob from Walrus storage');
    }
  }

  /**
   * Handle Walrus errors with logging and alerts
   */
  static handleWalrusError(error: Error, context?: Record<string, unknown>): void {
    logger.error('Walrus error occurred', {
      error: error.message,
      stack: error.stack,
      ...context,
    });

    // Check for blob loss or replication issues
    if (error.message.includes('replication') || error.message.includes('unavailable')) {
      logger.error('CRITICAL: Potential blob loss or replication issue', context);
      // TODO: Send alert to monitoring system
    }
  }

  /**
   * Verify blob integrity by checking if it exists and is accessible
   */
  static async verifyBlobIntegrity(blobId: string): Promise<boolean> {
    try {
      const client = this.getClient();

      const response = await client.head(`/blobs/${blobId}`);
      return response.status === 200;
    } catch (error) {
      logger.warn('Blob integrity check failed', { blobId, error });
      return false;
    }
  }

  /**
   * Batch upload multiple blobs
   */
  static async uploadBlobBatch(
    blobs: Array<{
      data: Buffer;
      name?: string;
    }>,
  ): Promise<WalrusBlob[]> {
    try {
      const results = await Promise.all(
        blobs.map((blob) => this.uploadBlob(blob.data, { name: blob.name })),
      );

      logger.info('Batch upload completed', { count: results.length });
      return results;
    } catch (error) {
      logger.error('Batch upload failed', { error });
      throw new WalrusError('Failed to batch upload blobs to Walrus');
    }
  }
}
