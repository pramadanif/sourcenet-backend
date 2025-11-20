import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { S3Error } from '@/types/errors.types';

const GATEWAY_URL = 'https://gateway.walrus.space/ipfs';
const REQUEST_TIMEOUT = 30000; // 30 seconds

interface UploadedFile {
  cid: string;
  url: string;
  originalName: string;
  size: number;
  uploadedAt: string;
}

/**
 * Storage service for Walrus decentralized storage
 */
export class StorageService {
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

      logger.info('Walrus storage client initialized', { apiUrl: env.WALRUS_API_URL });
      return this.client;
    } catch (error) {
      logger.error('Failed to initialize Walrus client', { error });
      throw new S3Error('Failed to initialize Walrus storage client');
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
   * Upload file to Walrus Storage
   */
  /**
   * Upload file to Walrus Storage
   */
  static async uploadToWalrus(
    file: {
      buffer: Buffer;
      originalname: string;
    },
    folder: string = 'uploads',
  ): Promise<UploadedFile> {
    try {
      const uniquePath = `${folder}/${randomUUID()}-${file.originalname}`;

      logger.info('Uploading file to Walrus', {
        originalName: file.originalname,
        size: file.buffer.length,
        path: uniquePath,
      });

      // Try primary URL from env, then fallback to known working testnet publisher
      const urls = [
        env.WALRUS_API_URL,
        'https://publisher.walrus-testnet.walrus.space'
      ];

      let response: any;
      let lastError: any;
      let successUrl = '';

      for (const baseUrl of urls) {
        try {
          // Remove trailing slash if present
          const cleanUrl = baseUrl.replace(/\/$/, '');
          const endpoint = `${cleanUrl}/v1/blobs?epochs=5`; // Default to 5 epochs

          logger.info(`Attempting upload to ${endpoint}`);

          response = await axios.put(endpoint, file.buffer, {
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            timeout: 60000, // Increased timeout for large files
          });

          successUrl = cleanUrl;
          break; // Success
        } catch (error) {
          lastError = error;
          logger.warn(`Failed to upload to ${baseUrl}`, { error: (error as Error).message });
          continue;
        }
      }

      if (!response) {
        throw lastError || new Error('All Walrus endpoints failed');
      }

      // Handle Walrus response format
      // It can be { newlyCreated: { blobObject: { blobId: "..." } } } 
      // or { alreadyCertified: { blobId: "..." } }
      let blobId: string | undefined;

      if (response.data.newlyCreated) {
        blobId = response.data.newlyCreated.blobObject.blobId;
      } else if (response.data.alreadyCertified) {
        blobId = response.data.alreadyCertified.blobId;
      } else if (response.data.blobId) {
        // Direct blobId (some versions)
        blobId = response.data.blobId;
      }

      if (!blobId) {
        logger.error('Invalid Walrus response', { data: response.data });
        throw new Error('No blobId in Walrus response');
      }

      const uploadedFile: UploadedFile = {
        cid: blobId,
        url: `${GATEWAY_URL}/${blobId}`, // Use gateway for reading
        originalName: file.originalname,
        size: file.buffer.length,
        uploadedAt: new Date().toISOString(),
      };

      logger.info('File uploaded to Walrus successfully', {
        blobId,
        size: file.buffer.length,
        publisher: successUrl
      });

      return uploadedFile;
    } catch (error) {
      logger.error('Failed to upload file to Walrus', { error });
      throw new S3Error('Failed to upload file to Walrus storage');
    }
  }

  /**
   * Download file from Walrus Storage
   */
  static async downloadFromWalrus(cid: string): Promise<Buffer> {
    try {
      const url = `${GATEWAY_URL}/${cid}`;

      logger.info('Downloading file from Walrus', { cid });

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: REQUEST_TIMEOUT,
      });

      logger.info('File downloaded from Walrus', { cid });
      return Buffer.from(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn('File not found in Walrus', { cid });
        throw new S3Error(`File not found: ${cid}`);
      }

      logger.error('Failed to download file from Walrus', { error, cid });
      throw new S3Error('Failed to download file from Walrus storage');
    }
  }

  /**
   * Delete file from Walrus Storage
   * Note: Walrus is immutable, so this logs a warning
   */
  static async deleteFromWalrus(cid: string): Promise<void> {
    try {
      // Walrus storage is immutable, so we can't delete
      // But we can unpin if the API supports it
      logger.warn('Walrus storage is immutable - cannot delete file', { cid });

      // TODO: If Walrus API supports unpinning, implement here
      // const client = this.getClient();
      // await client.post(`/unpin/${cid}`);

      logger.info('File deletion recorded (immutable storage)', { cid });
    } catch (error) {
      logger.error('Failed to process file deletion', { error, cid });
      throw new S3Error('Failed to process file deletion');
    }
  }

  /**
   * Generate public URL for file access
   */
  static generatePublicUrl(cid: string): string {
    return `${GATEWAY_URL}/${cid}`;
  }

  /**
   * Verify file exists in Walrus
   */
  static async verifyFileExists(cid: string): Promise<boolean> {
    try {
      const url = `${GATEWAY_URL}/${cid}`;
      const response = await axios.head(url, { timeout: REQUEST_TIMEOUT });
      return response.status === 200;
    } catch (error) {
      logger.warn('File verification failed', { cid, error });
      return false;
    }
  }

  /**
   * Get file metadata from Walrus
   */
  static async getFileMetadata(cid: string): Promise<any> {
    try {
      const client = this.getClient();
      const response = await client.get(`/metadata/${cid}`);

      logger.info('Retrieved file metadata', { cid });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn('File metadata not found', { cid });
        throw new S3Error(`File not found: ${cid}`);
      }

      logger.error('Failed to get file metadata', { error, cid });
      throw new S3Error('Failed to fetch file metadata');
    }
  }

  /**
   * Batch upload multiple files
   */
  static async batchUploadToWalrus(
    files: Array<{
      buffer: Buffer;
      originalname: string;
    }>,
    folder: string = 'uploads',
  ): Promise<UploadedFile[]> {
    try {
      const results = await Promise.all(
        files.map((file) => this.uploadToWalrus(file, folder)),
      );

      logger.info('Batch upload completed', { count: results.length });
      return results;
    } catch (error) {
      logger.error('Batch upload failed', { error });
      throw new S3Error('Failed to batch upload files to Walrus');
    }
  }

  /**
   * Cleanup old upload records from database
   * Note: Walrus files are immutable and cannot be deleted
   */
  static async cleanupOldUploads(olderThan: Date): Promise<number> {
    try {
      logger.info('Cleaning up old upload records', { olderThan });

      // TODO: Implement database cleanup
      // This would query the database for old upload records
      // and remove them from the local tracking system
      // The actual files in Walrus remain immutable

      logger.info('Old upload records cleanup completed');
      return 0; // Placeholder
    } catch (error) {
      logger.error('Failed to cleanup old uploads', { error });
      throw new S3Error('Failed to cleanup old uploads');
    }
  }
}
