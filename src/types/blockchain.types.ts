/**
 * Blockchain-related types and enums
 */

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export interface SuiTransaction {
  digest: string;
  status: TransactionStatus;
  gasUsed?: number;
  error?: string;
}

export interface PTBTransaction {
  id: string;
  type: 'publish' | 'purchase' | 'release_payment' | 'refund';
  status: TransactionStatus;
  digest?: string;
}
