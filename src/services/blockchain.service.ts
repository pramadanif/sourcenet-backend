import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1Keypair } from '@mysten/sui/keypairs/secp256r1';
import { sign as naclSign } from 'tweetnacl';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { BlockchainError } from '@/types/errors.types';
import { retry } from '@/utils/helpers';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const TX_TIMEOUT = 60000; // 60 seconds

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
      // Return null on error to be safe, or rethrow?
      // If we can't query, we probably shouldn't try to create one blindly, but let's return null to allow retry/creation attempt
      return null;
    }
  }

  /**
   * Build PTB for publishing DataPod
   * Creates Kiosk if needed and lists DataPod
   */
  // ... di dalam class BlockchainService
  /**
   * Build PTB for publishing DataPod
   * Creates Kiosk if needed and lists DataPod
   */
  static buildPublishPTB(
    datapodMetadata: DataPodMetadata,
    sponsor: string,
    kioskData: KioskData | null // Asumsi KioskData adalah tipe yang benar
  ): Transaction {
    try {
      const tx = new Transaction();

      let kiosk, kioskCap;
      let isNewKiosk = false;

      // --- 1. HANDLE KIOSK ---
      if (kioskData && kioskData.kioskId && kioskData.kioskOwnerCap) {
        // Kiosk sudah ada (existing Kiosk)
        kiosk = tx.object(kioskData.kioskId);
        kioskCap = tx.object(kioskData.kioskOwnerCap);
      } else {
        // Command 0: Create new Kiosk
        const [newKiosk, newKioskCap] = tx.moveCall({
          target: '0x2::kiosk::new',
          arguments: [],
        });
        kiosk = newKiosk;      // Result 0 (Kiosk Object)
        kioskCap = newKioskCap; // Result 1 (Kiosk Owner Cap)
        isNewKiosk = true;

        // ❌ MENGHAPUS COMMAND SHARE KIOSK LAMA (Command 1) ❌
        // Menghindari InvalidValueUsage: Kiosk harus tetap menjadi objek yang
        // dapat di-mutate oleh Kiosk Owner Cap sebelum ditransfer.
      }
      
      // --- 2. CREATE DATAPOD ---
      // Command 1 atau 2 (Tergantung isNewKiosk): datapod::create_datapod
      // Signature Move: 
      // datapod_id: String, title: String, category: String, description: String, 
      // price_sui: u64, data_hash: String, blob_id: String, ctx: &mut TxContext
      const [datapod, ownerCap] = tx.moveCall({ 
        target: `${SUI_PACKAGE_ID}::datapod::create_datapod`,
        arguments: [
          tx.pure.string(datapodMetadata.blobId),        // Arg 0: datapod_id (gunakan blobId)
          tx.pure.string(datapodMetadata.title),         // Arg 1: title
          tx.pure.string(datapodMetadata.category),      // Arg 2: category
          tx.pure.string(datapodMetadata.description),   // Arg 3: description
          tx.pure.u64(datapodMetadata.price),            // Arg 4: price_sui (u64)
          tx.pure.string(datapodMetadata.dataHash),      // Arg 5: data_hash
          tx.pure.string(datapodMetadata.uploadId),      // Arg 6: blob_id (gunakan uploadId) 
        ],
      });

      // --- 3. PLACE DATAPOD IN KIOSK ---
      // Command 2 atau 3: kiosk::place
      tx.moveCall({
        target: '0x2::kiosk::place',
        arguments: [
          kiosk,      // &mut Kiosk
          kioskCap,   // &KioskOwnerCap
          datapod,    // T (DataPod)
        ],
        typeArguments: [`${SUI_PACKAGE_ID}::datapod::DataPod`],
      });

      // --- 4. TRANSFER CAPABILITIES ---
      
      // Transfer DataPod Owner Cap (hasil dari Command sebelumnya) ke seller
      // Command 3 atau 4
      tx.transferObjects([ownerCap], tx.pure.address(datapodMetadata.sellerAddress));

      if (isNewKiosk) {
        // Transfer Kiosk Owner Cap ke seller HANYA jika baru dibuat.
        // Command 4 atau 5
        tx.transferObjects([kioskCap], tx.pure.address(datapodMetadata.sellerAddress));

        // Command 5 atau 6: Share Kiosk AGAR bisa diakses publik setelah semua mutasi selesai.
        tx.moveCall({
            target: '0x2::transfer::public_share_object',
            arguments: [kiosk],
            typeArguments: ['0x2::kiosk::Kiosk'],
        });
      }

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

        // Debug key length
        // console.log(`Sponsor private key length: ${privateKeyBytes.length} bytes`);

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
      } else {
        // For non-sponsored transactions (not implemented yet)
        throw new Error('Non-sponsored transactions not implemented');
      }
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
        sponsor,
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