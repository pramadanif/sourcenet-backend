import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { verify } from 'tweetnacl';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { BlockchainError } from '@/types/errors.types';
import { retry } from '@/utils/helpers';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const TX_TIMEOUT = 60000; // 60 seconds

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
    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    
    return isValid;
  } catch (error) {
    logger.warn('Signature verification failed', { error, publicKeyLength: publicKey.length });
    return false;
  }
}

  /**
   * Build PTB for publishing DataPod
   * Creates Kiosk if needed and lists DataPod
   */
  static buildPublishPTB(
    datapodMetadata: {
      title: string;
      category: string;
      price: number;
      dataHash: string;
      blobId: string;
    },
    seller: string,
    sponsor: string,
  ): Transaction {
    try {
      const tx = new Transaction();

      // TODO: Implement Kiosk check and creation
      // For now, return basic transaction structure
      logger.info('Building publish PTB', {
        seller,
        datapodMetadata,
      });

      return tx;
    } catch (error) {
      logger.error('Failed to build publish PTB', { error });
      throw new BlockchainError('Failed to build publish transaction');
    }
  }

  /**
   * Build PTB for purchasing DataPod
   * Creates PurchaseRequest and Escrow atomically
   */
  static buildPurchasePTB(
    datapodId: string,
    buyer: string,
    seller: string,
    price: number,
    buyerPublicKey: string,
    sponsor: string,
  ): Transaction {
    try {
      const tx = new Transaction();

      // TODO: Implement purchase logic
      // 1. Create PurchaseRequest
      // 2. Create Escrow
      // 3. Transfer payment
      logger.info('Building purchase PTB', {
        datapodId,
        buyer,
        seller,
        price,
      });

      return tx;
    } catch (error) {
      logger.error('Failed to build purchase PTB', { error });
      throw new BlockchainError('Failed to build purchase transaction');
    }
  }

  /**
   * Build PTB for releasing payment to seller
   */
  static buildReleasePaymentPTB(
    purchaseId: string,
    seller: string,
    sponsor: string,
  ): Transaction {
    try {
      const tx = new Transaction();

      // TODO: Implement payment release logic
      // 1. Get escrow amount
      // 2. Transfer to seller
      // 3. Mark as completed
      logger.info('Building release payment PTB', {
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
   * Execute transaction on blockchain
   */
  static async executeTransaction(
    transaction: Transaction,
    signer?: any,
  ): Promise<string> {
    try {
      const client = this.getClient();

      // TODO: Implement actual transaction execution
      // For now, return mock digest
      logger.info('Executing transaction', { signer });

      // Placeholder for actual execution
      const digest = `0x${Buffer.from('mock_digest').toString('hex')}`;
      return digest;
    } catch (error) {
      logger.error('Transaction execution failed', { error });
      throw new BlockchainError('Transaction execution failed');
    }
  }

  /**
   * Poll transaction status until confirmed
   */
  static async waitForTransaction(
    digest: string,
    timeout: number = TX_TIMEOUT,
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
  static async queryEvents(
    eventType: string,
    limit: number = 100,
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
  static async getBalance(address: string, coinType: string = '0x2::sui::SUI'): Promise<bigint> {
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
}
