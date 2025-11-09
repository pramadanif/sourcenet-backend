import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { logger } from '@/utils/logger';
import { env } from './env';

let suiClient: SuiClient | null = null;

/**
 * Initialize Sui client
 */
export function initializeSuiClient(): SuiClient {
  if (suiClient) {
    return suiClient;
  }

  try {
    const rpcUrl = env.SUI_RPC_URL || getFullnodeUrl(env.SUI_NETWORK as any);

    suiClient = new SuiClient({
      url: rpcUrl,
    });

    logger.info('Sui client initialized', {
      network: env.SUI_NETWORK,
      rpcUrl,
    });

    return suiClient;
  } catch (error) {
    logger.error('Failed to initialize Sui client', { error });
    throw error;
  }
}

/**
 * Get Sui client instance
 */
export function getSuiClient(): SuiClient {
  if (!suiClient) {
    return initializeSuiClient();
  }
  return suiClient;
}

/**
 * Blockchain configuration
 */
export const blockchainConfig = {
  // Network
  network: env.SUI_NETWORK,
  rpcUrl: env.SUI_RPC_URL,

  // Package IDs
  sourcenetPackageId: env.SOURCENET_PACKAGE_ID,
  kioskPackageId: '0x2::kiosk',
  clockId: '0x6',

  // Sponsor account for transactions
  sponsorAddress: env.SUI_SPONSOR_ADDRESS,
  sponsorPrivateKey: env.SUI_SPONSOR_PRIVATE_KEY,

  // Transaction settings
  gasBudget: 50000000, // 0.05 SUI
  gasPrice: 1000,

  // Event polling
  eventPollIntervalMs: 3000,
  eventBatchSize: 100,

  // Timeouts
  rpcTimeoutMs: 10000,
  txConfirmationTimeoutMs: 60000,
};

export default blockchainConfig;
