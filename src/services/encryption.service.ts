import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { secretbox, box, randomBytes as libsodiumRandomBytes } from 'tweetnacl';
import { sha256 } from '@noble/hashes/sha256';
import { logger } from '@/utils/logger';
import { EncryptionError } from '@/types/errors.types';

const NONCE_SIZE = 12; // 12 bytes for GCM
const TAG_SIZE = 16; // 16 bytes for GCM
const KEY_SIZE = 32; // 32 bytes for AES-256
const EPHEMERAL_KEY_SIZE = 32; // 32 bytes for ephemeral key

/**
 * Encryption service for hybrid encryption (X25519 + AES-256-GCM)
 */
export class EncryptionService {
  /**
   * Generate X25519 keypair for buyer
   */
  static generateKeyPair(): { publicKey: string; privateKey: string } {
    try {
      const keypair = box.keyPair();
      return {
        publicKey: Buffer.from(keypair.publicKey).toString('base64'),
        privateKey: Buffer.from(keypair.secretKey).toString('base64'),
      };
    } catch (error) {
      logger.error('Failed to generate keypair', { error });
      throw new EncryptionError('Failed to generate encryption keypair');
    }
  }

  /**
   * Hybrid encryption: X25519 key exchange + AES-256-GCM
   * Seller encrypts data with buyer's public key
   * Only buyer with private key can decrypt
   */
  static async hybridEncrypt(
    plaintext: Buffer,
    buyerPublicKeyB64: string,
  ): Promise<{
    encryptedEphemeralKey: string;
    encryptedData: string;
    nonce: string;
    tag: string;
  }> {
    try {
      // 1. Generate ephemeral key (random 32 bytes)
      const ephemeralKey = randomBytes(EPHEMERAL_KEY_SIZE);

      // 2. Encrypt ephemeral key with buyer's X25519 public key
      const buyerPublicKey = Buffer.from(buyerPublicKeyB64, 'base64');
      const nonce24 = libsodiumRandomBytes(24); // NaCl box uses 24-byte nonce

      // Generate ephemeral keypair for this encryption
      const ephemeralKeypair = box.keyPair();

      // Encrypt ephemeral key using box (X25519 + XSalsa20-Poly1305)
      const encryptedEphemeralKeyBuffer = box(
        ephemeralKey,
        nonce24,
        buyerPublicKey as any,
        ephemeralKeypair.secretKey,
      );

      if (!encryptedEphemeralKeyBuffer) {
        throw new Error('Failed to encrypt ephemeral key');
      }

      // 3. Encrypt plaintext with AES-256-GCM using ephemeral key
      const iv = randomBytes(NONCE_SIZE);
      const cipher = createCipheriv('aes-256-gcm', ephemeralKey, iv);

      let encryptedData = cipher.update(plaintext);
      encryptedData = Buffer.concat([encryptedData, cipher.final()]);

      const tag = cipher.getAuthTag();

      // 4. Return all components (base64-encoded)
      return {
        encryptedEphemeralKey: Buffer.concat([
          ephemeralKeypair.publicKey,
          encryptedEphemeralKeyBuffer,
          nonce24,
        ]).toString('base64'),
        encryptedData: encryptedData.toString('base64'),
        nonce: iv.toString('base64'),
        tag: tag.toString('base64'),
      };
    } catch (error) {
      logger.error('Hybrid encryption failed', { error });
      throw new EncryptionError('Hybrid encryption failed');
    }
  }

  /**
   * Decrypt data (alias for hybridDecrypt)
   */
  static async decryptData(
    encryptedEphemeralKeyB64: string,
    encryptedDataB64: string,
    nonceB64: string,
    tagB64: string,
    buyerPrivateKeyB64: string,
  ): Promise<Buffer> {
    return this.hybridDecrypt(encryptedEphemeralKeyB64, encryptedDataB64, nonceB64, tagB64, buyerPrivateKeyB64);
  }

  /**
   * Hybrid decryption: Reverse of hybridEncrypt
   * Buyer decrypts data with their private key
   */
  static async hybridDecrypt(
    encryptedEphemeralKeyB64: string,
    encryptedDataB64: string,
    nonceB64: string,
    tagB64: string,
    buyerPrivateKeyB64: string,
  ): Promise<Buffer> {
    try {
      // 1. Decrypt ephemeral key with buyer's private key
      const encryptedEphemeralKeyBuffer = Buffer.from(encryptedEphemeralKeyB64, 'base64');
      const buyerPrivateKey = Buffer.from(buyerPrivateKeyB64, 'base64');

      // Extract components from encrypted ephemeral key
      const ephemeralPublicKey = encryptedEphemeralKeyBuffer.slice(0, 32);
      const encryptedKey = encryptedEphemeralKeyBuffer.slice(32, -24);
      const nonce24 = encryptedEphemeralKeyBuffer.slice(-24);

      // Decrypt ephemeral key using box
      const ephemeralKey = box.open(
        encryptedKey,
        nonce24,
        ephemeralPublicKey as any,
        buyerPrivateKey as any,
      );

      if (!ephemeralKey) {
        throw new Error('Failed to decrypt ephemeral key');
      }

      // 2. Decrypt data with AES-256-GCM using ephemeral key
      const encryptedData = Buffer.from(encryptedDataB64, 'base64');
      const iv = Buffer.from(nonceB64, 'base64');
      const tag = Buffer.from(tagB64, 'base64');

      const decipher = createDecipheriv('aes-256-gcm', ephemeralKey, iv);
      decipher.setAuthTag(tag);

      let plaintext = decipher.update(encryptedData);
      plaintext = Buffer.concat([plaintext, decipher.final()]);

      return plaintext;
    } catch (error) {
      logger.error('Hybrid decryption failed', { error });
      throw new EncryptionError('Hybrid decryption failed');
    }
  }

  /**
   * Calculate SHA-256 hash of buffer
   */
  static hashFile(buffer: Buffer): string {
    try {
      const hash = sha256(buffer);
      return Buffer.from(hash).toString('hex');
    } catch (error) {
      logger.error('File hashing failed', { error });
      throw new EncryptionError('File hashing failed');
    }
  }

  /**
   * Generate random encryption key (32 bytes)
   */
  static generateEncryptionKey(): Buffer {
    return randomBytes(KEY_SIZE);
  }

  /**
   * Simple AES-256-GCM encryption for file storage
   */
  static encryptFileSimple(buffer: Buffer, key: Buffer): Buffer {
    try {
      if (key.length !== KEY_SIZE) {
        throw new Error(`Key must be ${KEY_SIZE} bytes`);
      }

      const iv = randomBytes(NONCE_SIZE);
      const cipher = createCipheriv('aes-256-gcm', key, iv);

      let encrypted = cipher.update(buffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      const tag = cipher.getAuthTag();

      // Return: IV (12) + TAG (16) + ENCRYPTED_DATA
      return Buffer.concat([iv, tag, encrypted]);
    } catch (error) {
      logger.error('File encryption failed', { error });
      throw new EncryptionError('File encryption failed');
    }
  }

  /**
   * Simple AES-256-GCM decryption for file storage
   */
  static decryptFileSimple(encryptedBuffer: Buffer, key: Buffer): Buffer {
    try {
      if (key.length !== KEY_SIZE) {
        throw new Error(`Key must be ${KEY_SIZE} bytes`);
      }

      // Extract components: IV (12) + TAG (16) + ENCRYPTED_DATA
      const iv = encryptedBuffer.slice(0, NONCE_SIZE);
      const tag = encryptedBuffer.slice(NONCE_SIZE, NONCE_SIZE + TAG_SIZE);
      const encrypted = encryptedBuffer.slice(NONCE_SIZE + TAG_SIZE);

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted;
    } catch (error) {
      logger.error('File decryption failed', { error });
      throw new EncryptionError('File decryption failed');
    }
  }
}
