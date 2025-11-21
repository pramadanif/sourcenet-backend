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
      // Use known working Walrus testnet publisher endpoint
      // The env variable may point to api.testnet.walrus.io which doesn't resolve
      const baseURL = 'https://publisher.walrus-testnet.walrus.space';

      this.client = axios.create({
        baseURL,
        timeout: REQUEST_TIMEOUT,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      logger.info('Walrus client initialized', { apiUrl: baseURL });
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
   * Uses PUT /v1/blobs?epochs={EPOCHS} with binary data
   */
  static async uploadBlob(
    encryptedData: Buffer,
    metadata?: {
      name?: string;
      size?: number;
      epochs?: number;
    },
  ): Promise<WalrusBlob> {
    try {
      const uploadWithRetry = async (): Promise<WalrusBlob> => {
        const client = this.getClient();
        const epochs = metadata?.epochs || 5; // Default 5 epochs

        // Use PUT /v1/blobs?epochs={EPOCHS} with binary data
        const response = await client.put(
          `/v1/blobs?epochs=${epochs}`,
          encryptedData,
          {
            headers: {
              'Content-Type': 'application/octet-stream',
            },
          }
        );

        // Handle Walrus response format
        // Response can be:
        // - { newlyCreated: { blobObject: { blobId: "..." } } }
        // - { alreadyCertified: { blobId: "..." } }
        let blobId: string | undefined;

        if (response.data.newlyCreated?.blobObject?.blobId) {
          blobId = response.data.newlyCreated.blobObject.blobId;
        } else if (response.data.alreadyCertified?.blobId) {
          blobId = response.data.alreadyCertified.blobId;
        }

        if (!blobId) {
          logger.error('Invalid Walrus response', { data: response.data });
          throw new Error('No blob ID in response');
        }

        const blobUrl = `${env.WALRUS_BLOB_ENDPOINT}/v1/blobs/${blobId}`;

        logger.info('Blob uploaded to Walrus', {
          blobId,
          size: metadata?.size || encryptedData.length,
          epochs,
        });

        return {
          blobId: blobId,
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
   * Uses GET /v1/blobs/{blobId}
   */
  static async downloadBlob(blobId: string): Promise<Buffer> {
    try {
      const downloadWithRetry = async (): Promise<Buffer> => {
        const client = this.getClient();

        logger.debug('Downloading blob from Walrus', { blobId, endpoint: `/v1/blobs/${blobId}` });

        // Use GET /v1/blobs/{blobId}
        const response = await client.get(`/v1/blobs/${blobId}`, {
          responseType: 'arraybuffer',
          timeout: REQUEST_TIMEOUT,
        });

        logger.info('Blob downloaded from Walrus', { blobId, size: response.data.byteLength });
        return Buffer.from(response.data);
      };

      return await retry(downloadWithRetry, MAX_RETRIES, RETRY_DELAY);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error('Failed to download blob from Walrus - Axios error', {
          blobId,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });
      } else {
        logger.error('Failed to download blob from Walrus', { error, blobId });
      }
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
