import { randomUUID } from 'crypto';
import dayjs from 'dayjs';

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
  return `req-${randomUUID()}`;
}

/**
 * Format SUI price to readable format
 * @param sui Amount in SUI
 * @returns Formatted string (e.g., "0.5 SUI")
 */
export function formatPrice(sui: number): string {
  return `${sui.toFixed(2)} SUI`;
}

/**
 * Format date to ISO string
 */
export function formatDate(date: Date): string {
  return dayjs(date).toISOString();
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param delayMs Initial delay in milliseconds
 * @returns Result of function
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries) {
        const delay = delayMs * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Parse hex string to Buffer
 */
export function parseHexString(hex: string): Buffer {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Buffer.from(cleanHex, 'hex');
}

/**
 * Convert Buffer to hex string
 */
export function toHexString(buffer: Buffer): string {
  return `0x${buffer.toString('hex')}`;
}

/**
 * Parse signature from hex string to Buffer
 */
export function parseSignature(sig: string): Buffer {
  return parseHexString(sig);
}

/**
 * Validate hex string format
 */
export function isValidHexString(hex: string): boolean {
  const hexRegex = /^0x[0-9a-fA-F]*$/;
  return hexRegex.test(hex);
}

/**
 * Truncate address for display
 * @param address Full address
 * @param chars Number of characters to show from start and end
 * @returns Truncated address (e.g., "0x1234...abcd")
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Check if string is valid Sui address
 */
export function isValidSuiAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Normalize Sui address to lowercase with 0x prefix
 */
export function normalizeSuiAddress(address: string): string {
  let normalized = address.toLowerCase();
  if (!normalized.startsWith('0x')) {
    normalized = `0x${normalized}`;
  }
  return normalized;
}

/**
 * Convert MIST to SUI (1 SUI = 10^9 MIST)
 */
export function mistToSui(mist: number | bigint): number {
  const mistBig = typeof mist === 'bigint' ? mist : BigInt(mist);
  return Number(mistBig) / 1_000_000_000;
}

/**
 * Convert SUI to MIST (1 SUI = 10^9 MIST)
 */
export function suiToMist(sui: number): bigint {
  return BigInt(Math.floor(sui * 1_000_000_000));
}
