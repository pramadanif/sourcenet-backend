import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { sign as naclSign } from 'tweetnacl';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { BlockchainError } from '@/types/errors.types';
import { retry } from '@/utils/helpers';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const TX_TIMEOUT = 60000; // 60 seconds

// Sui package IDs and addresses
const SUI_PACKAGE_ID = env.SUI_DATAPOD_PACKAGE_ID;
const KIOSK_PACKAGE_ID = env.SUI_KIOSK_PACKAGE_ID || '0x2::kiosk';
const CLOCK_ID = '0x6';

interface DataPodMetadata {
  title: string;
  category: string;
  price: number;
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
  static async getOrCreateSellerKiosk(seller: string): Promise<KioskData> {
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

      // Kiosk not found, would need to create via transaction
      // For now, throw error - caller should handle kiosk creation
      throw new Error('No existing Kiosk found for seller');
    } catch (error) {
      logger.error('Failed to get seller Kiosk', { error, seller });
      throw new BlockchainError('Failed to retrieve seller Kiosk');
    }
  }

  /**
   * Build PTB for publishing DataPod
   * Creates Kiosk if needed and lists DataPod
   */
  static buildPublishPTB(
    datapodMetadata: DataPodMetadata,
    sponsor: string,
    kioskData: KioskData
  ): Transaction {
    try {
      const tx = new Transaction();

      // Set sponsor for gas
      tx.setSponsor(sponsor);

      const { kioskId, kioskOwnerCap } = kioskData;

      // Move call to mint DataPod NFT
      const datapodTxResult = tx.moveCall({
        target: `${SUI_PACKAGE_ID}::datapod::create_datapod`,
        arguments: [
          tx.pure.string(datapodMetadata.title),
          tx.pure.string(datapodMetadata.category),
          tx.pure.u64(datapodMetadata.price),
          tx.pure.string(datapodMetadata.dataHash),
          tx.pure.string(datapodMetadata.blobId),
          tx.pure.string(datapodMetadata.uploadId),
          tx.pure.address(datapodMetadata.sellerAddress),
        ],
      });

      // List DataPod in Kiosk
      tx.moveCall({
        target: `${KIOSK_PACKAGE_ID}::kiosk::list`,
        arguments: [
          tx.object(kioskId),
          tx.object(kioskOwnerCap),
          datapodTxResult,
          tx.pure.u64(datapodMetadata.price),
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
   * Build PTB for purchasing DataPod
   * Creates PurchaseRequest and Escrow atomically with sponsored gas
   */
  static buildPurchasePTB(
    purchaseData: PurchaseData,
    sponsor: string
  ): Transaction {
    try {
      const tx = new Transaction();

      // Set sponsor for gas fees
      tx.setSponsor(sponsor);

      // Split coins for payment (assumes buyer has SUI)
      const coinInputs = tx.splitCoins(tx.gas, [tx.pure.u64(purchaseData.price)]);

      // Create PurchaseRequest
      const purchaseRequest = tx.moveCall({
        target: `${SUI_PACKAGE_ID}::purchase::create_purchase_request`,
        arguments: [
          tx.pure.address(purchaseData.datapodId),
          tx.pure.address(purchaseData.buyer),
          tx.pure.address(purchaseData.seller),
          tx.pure.string(purchaseData.dataHash),
          tx.pure.string(purchaseData.buyerPublicKey),
        ],
      });

      // Create Escrow and deposit payment
      tx.moveCall({
        target: `${SUI_PACKAGE_ID}::escrow::create_escrow`,
        arguments: [
          purchaseRequest,
          coinInputs,
          tx.pure.u64(purchaseData.price),
          tx.pure.address(purchaseData.seller),
        ],
      });

      logger.info('Purchase PTB built', {
        buyer: purchaseData.buyer,
        datapodId: purchaseData.datapodId,
        price: purchaseData.price,
      });

      return tx;
    } catch (error) {
      logger.error('Failed to build purchase PTB', { error });
      throw new BlockchainError('Failed to build purchase transaction');
    }
  }

  /**
   * Build PTB for releasing payment to seller after fulfillment
   * Updates purchase status and transfers escrow to seller
   */
  static buildReleasePaymentPTB(
    purchaseId: string,
    seller: string,
    sponsor: string
  ): Transaction {
    try {
      const tx = new Transaction();

      // Set sponsor for gas
      tx.setSponsor(sponsor);

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
        ],
      });

      logger.info('Release payment PTB built', {
        purchaseId,
        seller,
      });

      return tx;
    } catch (error) {
      logger.error('Failed to build release payment PTB', { error });
      throw new BlockchainError('Failed to build release payment transaction');
    }
  }

  /**
   * Execute transaction on blockchain with sponsored gas fees
   */
  static async executeTransaction(
    transaction: Transaction,
    sponsor: boolean = true
  ): Promise<string> {
    try {
      const client = this.getClient();

      if (sponsor) {
        // Sign transaction with sponsor's private key
        const sponsorPrivateKey = env.SUI_SPONSOR_PRIVATE_KEY;

        // Create keypair from private key (expects base64 format)
        const keypair = Ed25519Keypair.fromSecretKey(
          Buffer.from(sponsorPrivateKey, 'base64')
        );

        // Sign the transaction
        const signedTransaction = await transaction.sign({ signer: keypair });

        // Execute the signed transaction
        const result = await client.executeTransactionBlock({
          transactionBlock: signedTransaction.bytes,
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

        return result.digest;
      } else {
        // For non-sponsored transactions (not implemented yet)
        throw new Error('Non-sponsored transactions not implemented');
      }
    } catch (error) {
      logger.error('Transaction execution failed', {
        error: error instanceof Error ? error.message : String(error),
        sponsor,
      });
      throw new BlockchainError('Transaction execution failed');
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

      while (Date.now() - startTime < timeout) {
        try {
          const tx = await client.getTransactionBlock({
            digest,
            options: {
              showEffects: true,
              showEvents: true,
            },
          });

          if (tx.effects?.status.status === 'success') {
            logger.info('Transaction confirmed', { digest });
            return tx;
          }

          if (tx.effects?.status.status === 'failure') {
            throw new Error(`Transaction failed: ${tx.effects.status.error}`);
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('not found')) {
            // Transaction not yet indexed, wait and retry
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
          throw error;
        }
      }

      throw new Error('Transaction confirmation timeout');
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
          showOwner: true,
        },
      });

      return obj;
    } catch (error) {
      logger.error('Failed to get object', { error, objectId });
      throw new BlockchainError('Failed to fetch object from blockchain');
    }
  }

  /**
   * Query events from blockchain
   */
  static async queryEvents(eventType: string, limit: number = 100): Promise<any[]> {
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