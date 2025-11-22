import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
import { sign as naclSign } from 'tweetnacl';
import { randomUUID } from 'crypto';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { BlockchainError } from '@/types/errors.types';
import { retry } from '@/utils/helpers';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const TX_TIMEOUT = 120000; // 120 seconds

// Sui package IDs and addresses
const SUI_PACKAGE_ID = env.SOURCENET_PACKAGE_ID;
const KIOSK_PACKAGE_ID = '0x2::kiosk';
const CLOCK_ID = '0x6';

interface DataPodMetadata {
  title: string;
  category: string;
  description: string;
  price: bigint;
  dataHash: string;
  blobId: string;
  uploadId: string;
  sellerAddress: string;
}

interface PurchaseData {
  datapodId: string;
  buyer: string;
  seller: string;
  price: number;
  buyerPublicKey: string;
  dataHash: string;
  purchaseId?: string;
}

interface KioskData {
  kioskId: string;
  kioskOwnerCap: string;
}

/**
 * Blockchain service for Sui network interactions
 */
export class BlockchainService {
  private static client: SuiClient | null = null;

  /**
   * Initialize Sui client with RPC endpoint
   */
  static initializeSuiClient(): SuiClient {
    if (this.client) {
      return this.client;
    }

    try {
      const rpcUrl = env.SUI_RPC_URL || getFullnodeUrl(env.SUI_NETWORK as any);

      this.client = new SuiClient({
        url: rpcUrl,
      });

      logger.info('Sui client initialized', { network: env.SUI_NETWORK, rpcUrl });
      return this.client;
    } catch (error) {
      logger.error('Failed to initialize Sui client', { error });
      throw new BlockchainError('Failed to initialize Sui client');
    }
  }

  /**
   * Get Sui client instance
   */
  static getClient(): SuiClient {
    if (!this.client) {
      return this.initializeSuiClient();
    }
    return this.client;
  }

  /**
   * Verify Ed25519 signature
   */
  static verifySignature(message: string, signature: string, publicKey: string): boolean {
    try {
      const messageBytes = new Uint8Array(Buffer.from(message, 'utf-8'));
      const signatureBytes = new Uint8Array(Buffer.from(signature, 'base64'));

      // Handle public key - extract last 32 bytes if it's a full key with type prefix
      let publicKeyBytes = new Uint8Array(Buffer.from(publicKey, 'base64'));

      // Sui public keys often have a type byte prefix, extract the 32-byte key
      if (publicKeyBytes.length > 32) {
        publicKeyBytes = publicKeyBytes.slice(-32);
      }

      // tweetnacl detached signature verification
      const isValid = naclSign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes
      );

      return isValid;
    } catch (error) {
      logger.warn('Signature verification failed', {
        error,
        publicKeyLength: publicKey.length,
      });
      return false;
    }
  }

  /**
   * Get or create seller's Kiosk
   * Returns Kiosk ID and OwnerCap from on-chain state
   */
  static async getOrCreateSellerKiosk(seller: string): Promise<KioskData | null> {
    try {
      const client = this.getClient();

      // Query seller's owned objects to find existing Kiosk
      const objects = await client.getOwnedObjects({
        owner: seller,
        filter: {
          StructType: `${KIOSK_PACKAGE_ID}::kiosk::Kiosk`,
        },
      });

      if (objects.data && objects.data.length > 0) {
        const kioskObj = objects.data[0];
        const kioskId = kioskObj.data?.objectId;

        if (kioskId) {
          logger.info('Existing Kiosk found', { seller, kioskId });

          // Query for OwnerCap
          const caps = await client.getOwnedObjects({
            owner: seller,
            filter: {
              StructType: `${KIOSK_PACKAGE_ID}::kiosk::KioskOwnerCap`,
            },
          });

          const capId = caps.data?.[0]?.data?.objectId;

          if (capId) {
            return { kioskId, kioskOwnerCap: capId };
          }
        }
      }

      // Kiosk not found
      return null;
    } catch (error) {
      logger.error('Failed to get seller Kiosk', { error, seller });
      return null;
    }
  }

  /**
   * Build PTB for publishing DataPod
   * Creates Kiosk if needed and lists DataPod
   */
  static buildPublishPTB(
    datapodMetadata: DataPodMetadata,
    sponsor: string,
    kioskData: KioskData | null
  ): Transaction {
    try {
      const tx = new Transaction();

      // --- 1. CREATE DATAPOD ---
      // Call create_datapod - objects are transferred within Move function
      // Do NOT capture return values as they're already transferred
      tx.moveCall({
        target: `${SUI_PACKAGE_ID}::datapod::create_datapod`,
        arguments: [
          tx.pure.string(datapodMetadata.blobId),
          tx.pure.string(datapodMetadata.title),
          tx.pure.string(datapodMetadata.category),
          tx.pure.string(datapodMetadata.description),
          tx.pure.u64(datapodMetadata.price),
          tx.pure.string(datapodMetadata.dataHash),
          tx.pure.string(datapodMetadata.uploadId),
        ],
      });

      logger.info('Published DataPod PTB built', {
        seller: datapodMetadata.sellerAddress,
        datapodId: datapodMetadata.blobId,
      });

      return tx;
    } catch (error) {
      logger.error('Failed to build publish PTB', { error });
      throw new BlockchainError('Failed to build publish transaction');
    }
  }

  /**
   * Build PTB for creating a purchase request
   */
  static buildPurchasePTB(
    purchaseData: PurchaseData,
    sponsor: string
  ): Transaction {
    try {
      const tx = new Transaction();
      const purchaseId = purchaseData.purchaseId || randomUUID();

      // Create purchase object
      const [purchaseRequest, purchaseOwnerCap] = tx.moveCall({
        target: `${SUI_PACKAGE_ID}::purchase::create_purchase`,
        arguments: [
          tx.pure.string(purchaseId),
          tx.pure.string(purchaseData.datapodId),
          tx.pure.address(purchaseData.buyer),
          tx.pure.address(purchaseData.seller),
          tx.pure.string(purchaseData.buyerPublicKey),
          tx.pure.u64(purchaseData.price),
          tx.pure.string(purchaseData.dataHash),
        ],
      });

      // Share PurchaseRequest so it can be accessed by seller and mutated by backend
      // Use public_share_object because PurchaseRequest has 'store' ability and we are outside the module
      tx.moveCall({
        target: '0x2::transfer::public_share_object',
        arguments: [purchaseRequest],
        typeArguments: [`${SUI_PACKAGE_ID}::purchase::PurchaseRequest`],
      });

      // Transfer PurchaseOwnerCap to sponsor (backend) so we can manage it
      tx.transferObjects([purchaseOwnerCap], tx.pure.address(sponsor));

      logger.info('Purchase PTB built', {
        purchaseId,
        buyer: purchaseData.buyer,
        seller: purchaseData.seller,
      });

      return tx;
    } catch (error) {
      logger.error('Failed to build purchase PTB', { error });
      throw new BlockchainError('Failed to build purchase transaction');
    }
  }

  /**
   * Get PurchaseRequest Object ID from the custom purchase ID string
   */
  static async getPurchaseRequestObjectId(
    customPurchaseId: string,
    sellerAddress: string
  ): Promise<string | null> {
    try {
      const client = this.getClient();
      console.log(`[DEBUG] Looking for PurchaseRequest object with ID ${customPurchaseId} owned by ${sellerAddress}`);

      const objects = await client.getOwnedObjects({
        owner: sellerAddress,
        filter: {
          StructType: `${SUI_PACKAGE_ID}::purchase::PurchaseRequest`,
        },
        options: {
          showContent: true,
        },
      });

      if (!objects.data) {
        console.log('[DEBUG] No PurchaseRequest objects found for seller');
        return null;
      }

      console.log(`[DEBUG] Found ${objects.data.length} PurchaseRequest objects`);

      for (const obj of objects.data) {
        const content = obj.data?.content as any;
        const purchaseIdField = content?.fields?.purchase_id;
        console.log(`[DEBUG] Checking object ${obj.data?.objectId}, purchase_id: ${purchaseIdField}`);

        if (purchaseIdField === customPurchaseId) {
          console.log(`[DEBUG] Found match: ${obj.data?.objectId}`);
          return obj.data?.objectId || null;
        }
      }

      console.log(`[DEBUG] PurchaseRequest object not found for custom ID ${customPurchaseId}`);
      return null;
    } catch (error) {
      console.error('[DEBUG] Failed to get PurchaseRequest object ID', error);
      return null;
    }
  }

  /**
   * Get PurchaseOwnerCap for a specific purchase
   */
  static async getPurchaseOwnerCap(purchaseId: string, owner: string): Promise<string | null> {
    try {
      const client = this.getClient();

      logger.info(`Looking for PurchaseOwnerCap for purchase ${purchaseId} owned by ${owner}`);

      // Query owner's objects to find PurchaseOwnerCap
      const objects = await client.getOwnedObjects({
        owner,
        filter: {
          StructType: `${SUI_PACKAGE_ID}::purchase::PurchaseOwnerCap`,
        },
        options: {
          showContent: true,
        },
      });

      if (!objects.data) {
        logger.warn('No PurchaseOwnerCap objects found for owner');
        return null;
      }

      logger.info(`Found ${objects.data.length} PurchaseOwnerCap objects`);

      // Find the cap that matches the purchase ID
      for (const obj of objects.data) {
        const content = obj.data?.content as any;
        const capPurchaseId = content?.fields?.purchase_id;

        logger.info('Checking PurchaseOwnerCap', {
          objectId: obj.data?.objectId,
          capPurchaseId
        });

        if (capPurchaseId === purchaseId) {
          return obj.data?.objectId || null;
        }
      }

      logger.warn(`PurchaseOwnerCap not found for purchase ${purchaseId}`);
      return null;
    } catch (error) {
      logger.error('Failed to get PurchaseOwnerCap', { error, purchaseId, owner });
      return null;
    }
  }

  /**
   * Build PTB for releasing payment to seller after fulfillment
   * Updates purchase status and transfers escrow to seller
   */
  static buildReleasePaymentPTB(
    purchaseId: string,
    purchaseOwnerCapId: string,
    seller: string,
    sponsor: string
  ): Transaction {
    try {
      const tx = new Transaction();

      // Release escrow - move call to get the coin from escrow
      const releasedCoin = tx.moveCall({
        target: `${SUI_PACKAGE_ID}::escrow::release_escrow`,
        arguments: [
          tx.object(purchaseId),
          tx.object(CLOCK_ID),
        ],
      });

      // Transfer coin to seller
      tx.transferObjects([releasedCoin], tx.pure.address(seller));

      // Update purchase status to completed
      tx.moveCall({
        target: `${SUI_PACKAGE_ID}::purchase::complete_purchase`,
        arguments: [
          tx.object(purchaseId),
          tx.object(purchaseOwnerCapId),
        ],
      });

      return tx;
    } catch (error) {
      logger.error('Failed to build release payment PTB', { error });
      throw new BlockchainError('Failed to build release payment transaction');
    }
  }

  /**
   * Execute a transaction block with sponsor signature
   */
  static async executeTransaction(transaction: Transaction): Promise<string> {
    try {
      const client = this.getClient();
      const sponsorPrivateKey = env.SUI_SPONSOR_PRIVATE_KEY;

      let privateKeyBytes: Uint8Array;

      try {
        // Try to decode as standard Sui private key (suiprivkey...)
        const decoded = decodeSuiPrivateKey(sponsorPrivateKey);
        privateKeyBytes = decoded.secretKey;
      } catch (e) {
        // Fallback: try as raw base64 (legacy)
        try {
          privateKeyBytes = new Uint8Array(Buffer.from(sponsorPrivateKey, 'base64'));
        } catch (err) {
          throw new Error('Invalid private key format');
        }
      }

      if (privateKeyBytes.length !== 32) {
        if (privateKeyBytes.length === 64) {
          privateKeyBytes = privateKeyBytes.slice(0, 32);
        } else {
          throw new Error(`Invalid private key length: expected 32 bytes, got ${privateKeyBytes.length}`);
        }
      }

      let keypair;
      try {
        const decoded = decodeSuiPrivateKey(sponsorPrivateKey);
        if (decoded.schema === 'ED25519') {
          keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
        } else if (decoded.schema === 'Secp256k1') {
          keypair = Secp256k1Keypair.fromSecretKey(decoded.secretKey);
        } else if (decoded.schema === 'Secp256r1') {
          keypair = Secp256r1Keypair.fromSecretKey(decoded.secretKey);
        } else {
          throw new Error(`Unsupported key schema: ${decoded.schema}`);
        }
      } catch (e) {
        keypair = Secp256k1Keypair.fromSecretKey(privateKeyBytes);
      }

      // Set sender to sponsor address
      transaction.setSender(keypair.toSuiAddress());

      // Set gas budget (standard amount, can be adjusted)
      transaction.setGasBudget(100000000); // 0.1 SUI

      // Build the transaction bytes
      const bytes = await transaction.build({ client });

      // Sign the transaction
      const signedTransaction = await keypair.signTransaction(bytes);

      // Execute the signed transaction
      const result = await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature: signedTransaction.signature,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      logger.info('Sponsored transaction executed', {
        digest: result.digest,
        status: result.effects?.status.status,
      });

      if (result.effects?.status.status === 'failure') {
        throw new Error(`Transaction failed on-chain: ${result.effects.status.error}`);
      }

      return result.digest;
    } catch (error) {
      // Enhanced error logging
      const errorDetails = error instanceof Error ? error.message : String(error);
      const errorObj = typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error);

      console.error('----------------------------------------');
      console.error('BLOCKCHAIN TRANSACTION ERROR:');
      console.error(errorDetails);
      console.error('FULL ERROR OBJECT:');
      console.error(errorObj);
      console.error('----------------------------------------');

      logger.error('Transaction execution failed', {
        error: errorDetails,
        fullError: errorObj,
      });
      throw new BlockchainError(`Transaction execution failed: ${errorDetails}`);
    }
  }

  /**
   * Poll transaction status until confirmed
   */
  static async waitForTransaction(
    digest: string,
    timeout: number = TX_TIMEOUT
  ): Promise<any> {
    try {
      const client = this.getClient();
      const startTime = Date.now();
      let attempts = 0;

      // Initial delay to allow transaction to be indexed
      logger.debug('Waiting for initial indexing', { digest });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      while (Date.now() - startTime < timeout) {
        attempts++;
        try {
          logger.debug('Polling transaction status', { digest, attempts });
          const tx = await client.getTransactionBlock({
            digest,
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true,
            },
          });

          if (tx.effects?.status.status === 'success') {
            logger.info('Transaction confirmed', { digest, attempts });
            return tx;
          }

          if (tx.effects?.status.status === 'failure') {
            throw new Error(`Transaction failed: ${tx.effects.status.error}`);
          }

          // If we got here without success/failure, wait and retry
          const elapsed = Date.now() - startTime;
          logger.debug('Transaction still pending', { digest, attempts, elapsed });
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes('not found')) {
            // Transaction not yet indexed, wait and retry
            const elapsed = Date.now() - startTime;
            logger.debug('Transaction not yet indexed', { digest, attempts, elapsed });
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          throw error;
        }
      }

      throw new Error(`Transaction confirmation timeout after ${attempts} attempts`);
    } catch (error) {
      logger.error('Failed to wait for transaction', { error, digest });
      throw new BlockchainError('Transaction confirmation failed');
    }
  }

  /**
   * Get on-chain object details
   */
  static async getObject(objectId: string): Promise<any> {
    try {
      const client = this.getClient();
      const obj = await client.getObject({
        id: objectId,
        options: {
          showContent: true,
        },
      });

      return obj;
    } catch (error) {
      logger.error('Failed to get object', { error, objectId });
      throw new BlockchainError('Failed to fetch object from blockchain');
    }
  }

  /**
   * Query blockchain events by type
   */
  static async queryEvents(
    eventType: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      const client = this.getClient();

      const events = await client.queryEvents({
        query: {
          MoveEventType: eventType,
        },
        limit,
      });

      return events.data;
    } catch (error) {
      logger.error('Failed to query events', { error, eventType });
      throw new BlockchainError('Failed to query blockchain events');
    }
  }

  /**
   * Get balance for address
   */
  static async getBalance(
    address: string,
    coinType: string = '0x2::sui::SUI'
  ): Promise<bigint> {
    try {
      const client = this.getClient();

      const balance = await client.getBalance({
        owner: address,
        coinType,
      });

      return BigInt(balance.totalBalance);
    } catch (error) {
      logger.error('Failed to get balance', { error, address });
      throw new BlockchainError('Failed to fetch balance from blockchain');
    }
  }

  /**
   * Get purchase request details
   */
  static async getPurchaseRequest(purchaseId: string): Promise<any> {
    try {
      const obj = await this.getObject(purchaseId);

      if (!obj.data?.content) {
        throw new Error('Invalid purchase request object');
      }

      return obj.data.content;
    } catch (error) {
      logger.error('Failed to get purchase request', { error, purchaseId });
      throw new BlockchainError('Failed to fetch purchase request');
    }
  }

  /**
   * Get DataPod details
   */
  static async getDataPod(datapodId: string): Promise<any> {
    try {
      const obj = await this.getObject(datapodId);

      if (!obj.data?.content) {
        throw new Error('Invalid DataPod object');
      }

      return obj.data.content;
    } catch (error) {
      logger.error('Failed to get DataPod', { error, datapodId });
      throw new BlockchainError('Failed to fetch DataPod');
    }
  }

  /**
   * Query DataPod purchases events to track fulfillment
   */
  static async queryPurchaseEvents(
    eventType: string = 'PurchaseCreated',
    limit: number = 50
  ): Promise<any[]> {
    try {
      const fullEventType = `${SUI_PACKAGE_ID}::purchase::${eventType}`;
      return await this.queryEvents(fullEventType, limit);
    } catch (error) {
      logger.error('Failed to query purchase events', { error });
      throw new BlockchainError('Failed to query purchase events');
    }
  }

  /**
   * Batch execute multiple transactions with retry logic
   */
  static async executeTransactionWithRetry(
    transaction: Transaction,
    maxRetries: number = MAX_RETRIES
  ): Promise<string> {
    return retry(
      async () => {
        const digest = await this.executeTransaction(transaction);
        await this.waitForTransaction(digest);
        return digest;
      },
      maxRetries,
      RETRY_DELAY
    );
  }
}