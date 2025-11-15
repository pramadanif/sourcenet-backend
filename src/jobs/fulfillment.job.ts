import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import prisma from '@/config/database';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { EncryptionService } from '@/services/encryption.service';
import { WalrusService } from '@/services/walrus.service';
import { BlockchainService } from '@/services/blockchain.service';
import { CacheService } from '@/services/cache.service';
import { ValidationError, BlockchainError, WalrusError } from '@/types/errors.types';
import { sha256 } from '@noble/hashes/sha256';
import { performance } from 'perf_hooks';

interface FulfillmentJobData {
  purchase_id: string;
  datapod_id: string;
  seller_address: string;
  buyer_address: string;
  buyer_public_key: string;
  price_sui: number;
}

interface FulfillmentStepResult {
  stepName: string;
  duration: number;
  success: boolean;
  data?: any;
}

interface EncryptedBlobPayload {
  encryptedEphemeralKey: string;
  encryptedData: string;
  nonce: string;
  tag: string;
  data_hash: string;
}

const STEP_TIMEOUTS = {
  download: 60000,
  encrypt: 30000,
  upload: 120000,
  blockchain: 60000,
  database: 30000,
};

const RETRY_POLICIES = {
  walrusDownload: { maxRetries: 3, delays: [5000, 15000, 45000] },
  walrusUpload: { maxRetries: 3, delays: [5000, 15000, 45000] },
  blockchain: { maxRetries: 3, delays: [2000, 5000, 10000] },
  database: { maxRetries: 2, delays: [2000, 5000] },
};

let fulfillmentQueue: Queue<FulfillmentJobData> | null = null;
let fulfillmentWorker: Worker<FulfillmentJobData> | null = null;

/**
 * Helper: Log step with timing
 */
function logStep(purchaseId: string, result: FulfillmentStepResult): void {
  const status = result.success ? '✓' : '✗';
  logger.debug(`[purchase:${purchaseId}] ${status} ${result.stepName} (${result.duration}ms)`);
}

/**
 * Helper: Retry with custom delays
 */
async function retryWithCustomDelays<T>(
  fn: () => Promise<T>,
  delays: number[],
  stepName: string,
  purchaseId: string,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < delays.length) {
        const delay = delays[attempt];
        logger.warn(`[purchase:${purchaseId}] ${stepName} attempt ${attempt + 1}/${delays.length + 1} failed, retrying in ${delay}ms`, {
          error: (error as Error).message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`${stepName} failed after ${delays.length + 1} attempts`);
}

/**
 * Initialize BullMQ fulfillment queue and worker
 */
export const initializeFulfillmentQueue = async (): Promise<Queue<FulfillmentJobData>> => {
  if (fulfillmentQueue) {
    return fulfillmentQueue;
  }

  try {
    const redisConnection = new Redis({
      host: new URL(env.REDIS_URL).hostname || 'localhost',
      port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    fulfillmentQueue = new Queue<FulfillmentJobData>('fulfillment', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    logger.info('Fulfillment queue initialized');
    return fulfillmentQueue;
  } catch (error) {
    logger.error('Failed to initialize fulfillment queue', { error });
    throw error;
  }
};

/**
 * Start fulfillment worker
 */
export const startFulfillmentWorker = async (): Promise<void> => {
  try {
    const queue = await initializeFulfillmentQueue();

    const redisConnection = new Redis({
      host: new URL(env.REDIS_URL).hostname || 'localhost',
      port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    fulfillmentWorker = new Worker<FulfillmentJobData>(
      'fulfillment',
      async (job: Job<FulfillmentJobData>) => {
        return await processFulfillmentJob(job);
      },
      {
        connection: redisConnection,
        concurrency: 5,
      },
    );

    // Event handlers
    fulfillmentWorker.on('completed', (job: Job) => {
      logger.info('Fulfillment job completed', { jobId: job.id, data: job.data });
    });

    fulfillmentWorker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Fulfillment job failed', { jobId: job?.id, error: error.message });
    });

    fulfillmentWorker.on('error', (error: Error) => {
      logger.error('Fulfillment worker error', { error: error.message });
    });

    logger.info('Fulfillment worker started');
  } catch (error) {
    logger.error('Failed to start fulfillment worker', { error });
    throw error;
  }
};

/**
 * Step 1: Validate purchase request
 */
async function validatePurchaseRequest(purchaseId: string): Promise<any> {
  const startTime = performance.now();
  try {
    const purchaseRequest = await retryWithCustomDelays(
      async () => {
        const pr = await prisma.purchaseRequest.findUnique({
          where: { id: purchaseId },
          include: {
            datapod: {
              include: {
                uploadStaging: true, // Include upload staging to get encryption key
              },
            },
          },
        });
        if (!pr) throw new Error(`Purchase request not found: ${purchaseId}`);
        return pr;
      },
      RETRY_POLICIES.database.delays,
      'validatePurchaseRequest',
      purchaseId,
    );

    if (purchaseRequest.status !== 'pending') {
      throw new Error(`Purchase status is ${purchaseRequest.status}, expected pending`);
    }

    if (purchaseRequest.encryptedBlobId) {
      throw new Error('Purchase already has encrypted blob ID');
    }

    // Verify encryption key is available
    const uploadStaging = purchaseRequest.datapod?.uploadStaging;
    if (!uploadStaging) {
      throw new Error('Upload staging not found for datapod');
    }

    const metadata = uploadStaging.metadata as any;
    if (!metadata?.encryptionKey) {
      throw new Error('Encryption key not found in upload staging metadata');
    }

    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 1: Validate Purchase',
      duration: Math.round(duration),
      success: true,
      data: { purchaseId },
    });

    return purchaseRequest;
  } catch (error) {
    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 1: Validate Purchase',
      duration: Math.round(duration),
      success: false,
    });
    throw error;
  }
}

/**
 * Step 2: Download original file from Walrus
 */
async function downloadOriginalBlob(purchaseId: string, blobId: string): Promise<Buffer> {
  const startTime = performance.now();
  try {
    const blob = await retryWithCustomDelays(
      async () => {
        try {
          return await WalrusService.downloadBlob(blobId);
        } catch (error) {
          if (error instanceof Error && error.message.includes('not found')) {
            logger.warn(`[purchase:${purchaseId}] Blob still uploading, retrying...`, { blobId });
          }
          throw error;
        }
      },
      RETRY_POLICIES.walrusDownload.delays,
      'downloadOriginalBlob',
      purchaseId,
    );

    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 2: Download from Walrus',
      duration: Math.round(duration),
      success: true,
      data: { blobId, size: blob.length },
    });

    return blob;
  } catch (error) {
    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 2: Download from Walrus',
      duration: Math.round(duration),
      success: false,
    });
    throw error;
  }
}

/**
 * Step 2.5: Decrypt seller's encrypted file
 */
async function decryptSellerFile(
  purchaseId: string,
  encryptedBlob: Buffer,
  encryptionKeyB64: string,
): Promise<Buffer> {
  const startTime = performance.now();
  try {
    const decryptedData = EncryptionService.decryptFileSimple(
      encryptedBlob,
      Buffer.from(encryptionKeyB64, 'base64'),
    );

    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 2.5: Decrypt Seller File',
      duration: Math.round(duration),
      success: true,
      data: { size: decryptedData.length },
    });

    logger.debug(`[purchase:${purchaseId}] Seller's file decrypted successfully`);
    return decryptedData;
  } catch (error) {
    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 2.5: Decrypt Seller File',
      duration: Math.round(duration),
      success: false,
    });
    throw error;
  }
}

/**
 * Step 3: Re-encrypt for buyer (CRITICAL)
 */
async function reEncryptForBuyer(
  purchaseId: string,
  plaintextFile: Buffer,
  buyerPublicKey: string,
): Promise<EncryptedBlobPayload> {
  const startTime = performance.now();
  try {
    const encryptedResult = await EncryptionService.hybridEncrypt(plaintextFile, buyerPublicKey);

    const dataHash = Buffer.from(sha256(Buffer.from(encryptedResult.encryptedData, 'base64'))).toString('hex');

    const payload: EncryptedBlobPayload = {
      encryptedEphemeralKey: encryptedResult.encryptedEphemeralKey,
      encryptedData: encryptedResult.encryptedData,
      nonce: encryptedResult.nonce,
      tag: encryptedResult.tag,
      data_hash: dataHash,
    };

    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 3: Re-encrypt for Buyer',
      duration: Math.round(duration),
      success: true,
      data: { dataHash },
    });

    logger.debug(`[purchase:${purchaseId}] File re-encrypted for buyer (only buyer can decrypt)`);
    return payload;
  } catch (error) {
    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 3: Re-encrypt for Buyer',
      duration: Math.round(duration),
      success: false,
    });
    throw error;
  }
}

/**
 * Step 4: Upload encrypted blob to Walrus
 */
async function uploadEncryptedBlob(
  purchaseId: string,
  payload: EncryptedBlobPayload,
): Promise<string> {
  const startTime = performance.now();
  try {
    const blobBuffer = Buffer.from(payload.encryptedData, 'base64');

    const result = await retryWithCustomDelays(
      async () => {
        return await WalrusService.uploadBlob(blobBuffer, {
          name: `purchase-${purchaseId}`,
          size: blobBuffer.length,
        });
      },
      RETRY_POLICIES.walrusUpload.delays,
      'uploadEncryptedBlob',
      purchaseId,
    );

    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 4: Upload to Walrus',
      duration: Math.round(duration),
      success: true,
      data: { blobId: result.blobId },
    });

    logger.debug(`[purchase:${purchaseId}] File uploaded to Walrus, blob_id = ${result.blobId}`);
    return result.blobId;
  } catch (error) {
    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 4: Upload to Walrus',
      duration: Math.round(duration),
      success: false,
    });
    throw error;
  }
}

/**
 * Step 5: Update blockchain with blob_id
 */
async function updateBlockchain(
  purchaseId: string,
  datapodId: string,
  buyerAddress: string,
  blobId: string,
  priceSui: number,
  escrowId: string,
  purchaseOwnerCapId: string,
  sellerAddress: string,
): Promise<string> {
  const startTime = performance.now();
  try {
    // Build PTB transaction for blockchain update
    const tx = BlockchainService.buildReleasePaymentPTB(
      purchaseId,
      escrowId,
      purchaseOwnerCapId,
      sellerAddress,
      env.SUI_SPONSOR_ADDRESS
    );

    const txDigest = await retryWithCustomDelays(
      async () => {
        return await BlockchainService.executeTransaction(tx);
      },
      RETRY_POLICIES.blockchain.delays,
      'updateBlockchain',
      purchaseId,
    );

    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 5: Update Blockchain',
      duration: Math.round(duration),
      success: true,
      data: { txDigest },
    });

    logger.debug(`[purchase:${purchaseId}] Blockchain updated, tx_digest = ${txDigest}`);
    return txDigest;
  } catch (error) {
    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 5: Update Blockchain',
      duration: Math.round(duration),
      success: false,
    });
    throw error;
  }
}

/**
 * Step 6: Update database
 */
async function updateDatabase(
  purchaseId: string,
  datapodId: string,
  encryptedBlobId: string,
  encryptedEphemeralKey: string,
  txDigest: string,
  buyerAddress: string,
): Promise<void> {
  const startTime = performance.now();
  try {
    await retryWithCustomDelays(
      async () => {
        // Update purchase request
        await prisma.purchaseRequest.update({
          where: { id: purchaseId },
          data: {
            encryptedBlobId,
            decryptionKey: encryptedEphemeralKey,
            status: 'completed',
            txDigest,
            completedAt: new Date(),
          },
        });

        // Update escrow transaction
        const escrow = await prisma.escrowTransaction.findUnique({
          where: { purchaseRequestId: purchaseId },
        });

        if (escrow) {
          await prisma.escrowTransaction.update({
            where: { id: escrow.id },
            data: {
              status: 'released',
              txDigest,
              releasedAt: new Date(),
            },
          });
        }

        // Update datapod sales count
        await prisma.dataPod.update({
          where: { id: datapodId },
          data: {
            totalSales: { increment: 1 },
          },
        });

        // Store transaction audit
        await prisma.transactionAudit.create({
          data: {
            txDigest,
            txType: 'purchase_completed',
            userAddress: buyerAddress,
            datapodId,
            data: {
              purchaseId,
              encryptedBlobId,
            },
          },
        });
      },
      RETRY_POLICIES.database.delays,
      'updateDatabase',
      purchaseId,
    );

    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 6: Update Database',
      duration: Math.round(duration),
      success: true,
    });
  } catch (error) {
    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 6: Update Database',
      duration: Math.round(duration),
      success: false,
    });
    throw error;
  }
}

/**
 * Step 7: Emit events
 */
async function emitEvents(
  purchaseId: string,
  datapodId: string,
  buyerAddress: string,
  sellerAddress: string,
  priceSui: number,
): Promise<void> {
  const startTime = performance.now();
  try {
    // Get purchase and datapod details
    const purchase = await prisma.purchaseRequest.findUnique({
      where: { id: purchaseId },
      include: { datapod: true },
    });

    if (!purchase) {
      throw new Error('Purchase not found for event emission');
    }

    // Emit WebSocket event - purchase completed
    try {
      const { broadcaster } = await import('@/main');
      if (broadcaster) {
        await broadcaster.broadcastEvent({
          type: 'purchase.completed',
          data: {
            purchase_id: purchase.purchaseRequestId,
            datapod_id: datapodId,
            buyer_address: buyerAddress,
            seller_address: sellerAddress,
            status: 'completed',
          },
          timestamp: Math.floor(Date.now() / 1000),
          eventId: randomUUID(),
          blockHeight: 0,
        });

        // Emit WebSocket event - payment released
        await broadcaster.broadcastEvent({
          type: 'payment.released',
          data: {
            seller_address: sellerAddress,
            amount_sui: priceSui,
            purchase_id: purchase.purchaseRequestId,
          },
          timestamp: Math.floor(Date.now() / 1000),
          eventId: randomUUID(),
          blockHeight: 0,
        });

        logger.info(`[purchase:${purchaseId}] WebSocket events emitted successfully`);
      }
    } catch (wsError) {
      logger.warn(`[purchase:${purchaseId}] Failed to emit WebSocket event`, { error: wsError });
    }

    // Queue notification job (async, non-blocking)
    try {
      logger.debug(`[purchase:${purchaseId}] Queueing notification job`);
      // TODO: Queue notification job to send email/push notification to buyer and seller
      // Example: await notificationQueue.add('send-purchase-notification', { purchaseId, buyerAddress, sellerAddress });
    } catch (notifError) {
      logger.warn(`[purchase:${purchaseId}] Failed to queue notification job`, { error: notifError });
    }

    // Queue stats job (async, non-blocking)
    try {
      logger.debug(`[purchase:${purchaseId}] Queueing stats job`);
      // TODO: Queue stats job to update seller statistics
      // Example: await statsQueue.add('update-seller-stats', { sellerAddress, datapodId });
    } catch (statsError) {
      logger.warn(`[purchase:${purchaseId}] Failed to queue stats job`, { error: statsError });
    }

    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 7: Emit Events',
      duration: Math.round(duration),
      success: true,
    });

    logger.info(`[purchase:${purchaseId}] Events emitted successfully`);
  } catch (error) {
    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 7: Emit Events',
      duration: Math.round(duration),
      success: false,
    });
    logger.warn(`[purchase:${purchaseId}] Event emission failed (non-blocking)`, { error });
    // Don't throw - event emission is non-critical
  }
}

/**
 * Step 8: Cleanup memory
 */
async function cleanupMemory(purchaseId: string): Promise<void> {
  const startTime = performance.now();
  try {
    // Clear sensitive data from memory
    if (global.gc) {
      global.gc();
      logger.debug(`[purchase:${purchaseId}] Manual garbage collection executed`);
    }

    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 8: Memory Cleanup',
      duration: Math.round(duration),
      success: true,
    });
  } catch (error) {
    const duration = performance.now() - startTime;
    logStep(purchaseId, {
      stepName: 'Step 8: Memory Cleanup',
      duration: Math.round(duration),
      success: false,
    });
    logger.warn(`[purchase:${purchaseId}] Memory cleanup failed`, { error });
  }
}

/**
 * Process fulfillment job - ATOMIC operation
 * Steps:
 * 1. Validate purchase request
 * 2. Download original file from Walrus
 * 3. Re-encrypt for buyer (CRITICAL)
 * 4. Upload encrypted blob to Walrus
 * 5. Update blockchain with blob_id
 * 6. Update database
 * 7. Emit events
 * 8. Cleanup memory
 */
const processFulfillmentJob = async (job: Job<FulfillmentJobData>): Promise<void> => {
  const { purchase_id, datapod_id, seller_address, buyer_address, buyer_public_key, price_sui } =
    job.data;

  const jobStartTime = performance.now();

  logger.info('Processing fulfillment job', {
    jobId: job.id,
    purchaseId: purchase_id,
    datapodId: datapod_id,
  });

  try {
    // Step 1: Validate purchase request
    const purchaseRequest = await validatePurchaseRequest(purchase_id);

    // Step 2: Download original file from Walrus
    const encryptedBlob = await downloadOriginalBlob(purchase_id, purchaseRequest.datapod.blobId);

    // Step 2.5: Decrypt seller's encrypted file
    const uploadStaging = purchaseRequest.datapod?.uploadStaging;
    const metadata = uploadStaging?.metadata as any;
    const encryptionKey = metadata?.encryptionKey;

    if (!encryptionKey) {
      throw new Error('Encryption key not available for decryption');
    }

    const decryptedBlob = await decryptSellerFile(purchase_id, encryptedBlob, encryptionKey);

    // Step 3: Re-encrypt for buyer (CRITICAL)
    const encryptedPayload = await reEncryptForBuyer(purchase_id, decryptedBlob, buyer_public_key);

    // Step 4: Upload encrypted blob to Walrus
    const encryptedBlobId = await uploadEncryptedBlob(purchase_id, encryptedPayload);

    // Step 5: Update blockchain with blob_id
    // Fetch escrow and purchase owner cap IDs from database
    const escrowTransaction = await prisma.escrowTransaction.findFirst({
      where: { purchaseRequestId: purchaseRequest.id },
    });

    if (!escrowTransaction) {
      throw new Error('Escrow transaction not found for purchase');
    }

    // TODO: Retrieve purchaseOwnerCapId from blockchain or database
    // For now, generate deterministic ID based on purchase_id
    const purchaseOwnerCapId = `0x${Buffer.from(`cap_${purchase_id}`).toString('hex').padStart(64, '0')}`;

    const txDigest = await updateBlockchain(
      purchase_id,
      datapod_id,
      buyer_address,
      encryptedBlobId,
      price_sui,
      escrowTransaction.id,
      purchaseOwnerCapId,
      seller_address,
    );

    // Step 6: Update database
    await updateDatabase(
      purchase_id,
      purchaseRequest.datapodId,
      encryptedBlobId,
      encryptedPayload.encryptedEphemeralKey,
      txDigest,
      buyer_address,
    );

    // Step 7: Emit events
    await emitEvents(purchase_id, datapod_id, buyer_address, seller_address, price_sui);

    // Step 8: Cleanup memory
    await cleanupMemory(purchase_id);

    const totalDuration = performance.now() - jobStartTime;
    logger.info('Fulfillment job completed successfully', {
      jobId: job.id,
      purchaseId: purchase_id,
      totalDuration: Math.round(totalDuration),
      message: 'Purchase fulfilled: file decrypted, re-encrypted, and payment released',
    });
  } catch (error) {
    logger.error('Fulfillment job processing failed', {
      jobId: job.id,
      purchaseId: purchase_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      message: 'Critical: Check encryption key availability and file integrity',
    });

    // Mark purchase as failed
    try {
      await prisma.purchaseRequest.update({
        where: { id: purchase_id },
        data: {
          status: 'failed',
        },
      });
      logger.warn(`[purchase:${purchase_id}] Purchase marked as failed`);
    } catch (updateError) {
      logger.error('Failed to update purchase status to failed', { error: updateError });
    }

    // Re-throw error so BullMQ can handle retry
    throw error;
  }
};

/**
 * Queue fulfillment job
 */
export const queueFulfillmentJob = async (data: FulfillmentJobData): Promise<Job<FulfillmentJobData>> => {
  try {
    const queue = await initializeFulfillmentQueue();
    const job = await queue.add('fulfill', data, {
      jobId: `fulfill-${data.purchase_id}`,
      priority: 10,
    });

    logger.info('Fulfillment job queued', {
      jobId: job.id,
      purchaseId: data.purchase_id,
    });

    return job;
  } catch (error) {
    logger.error('Failed to queue fulfillment job', { error });
    throw error;
  }
};

/**
 * Get fulfillment queue
 */
export const getFulfillmentQueue = async (): Promise<Queue<FulfillmentJobData>> => {
  return await initializeFulfillmentQueue();
};

/**
 * Shutdown fulfillment queue and worker
 */
export const shutdownFulfillmentQueue = async (): Promise<void> => {
  try {
    if (fulfillmentWorker) {
      await fulfillmentWorker.close();
      fulfillmentWorker = null;
    }

    if (fulfillmentQueue) {
      await fulfillmentQueue.close();
      fulfillmentQueue = null;
    }

    logger.info('Fulfillment queue and worker shut down');
  } catch (error) {
    logger.error('Error shutting down fulfillment queue', { error });
  }
};
