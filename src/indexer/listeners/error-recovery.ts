import { logger } from '@/utils/logger';

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Error recovery handler with exponential backoff
 */
export class ErrorRecovery {
  private retryCount: number = 0;
  private lastError: Error | null = null;
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    context: string = 'operation',
  ): Promise<T> {
    this.retryCount = 0;

    while (this.retryCount < this.config.maxRetries) {
      try {
        const result = await fn();
        this.retryCount = 0; // Reset on success
        return result;
      } catch (error) {
        this.lastError = error as Error;
        this.retryCount++;

        if (this.retryCount >= this.config.maxRetries) {
          logger.error(`Failed after ${this.config.maxRetries} retries: ${context}`, {
            error: this.lastError.message,
            stack: this.lastError.stack,
          });
          throw this.lastError;
        }

        const delayMs = this.calculateBackoffDelay();
        logger.warn(`Retry ${this.retryCount}/${this.config.maxRetries} for ${context}`, {
          error: this.lastError.message,
          delayMs,
        });

        await this.sleep(delayMs);
      }
    }

    throw this.lastError || new Error('Unknown error');
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(): number {
    const exponentialDelay =
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, this.retryCount - 1);
    const delayWithJitter = exponentialDelay * (0.5 + Math.random() * 0.5); // Add jitter
    return Math.min(delayWithJitter, this.config.maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current retry count
   */
  getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Get last error
   */
  getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * Reset error state
   */
  reset(): void {
    this.retryCount = 0;
    this.lastError = null;
  }
}

/**
 * Categorize errors for different handling strategies
 */
export class ErrorClassifier {
  /**
   * Check if error is retryable
   */
  static isRetryable(error: any): boolean {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return true; // Network errors
    }

    if (error.message?.includes('timeout')) {
      return true; // Timeout errors
    }

    if (error.status === 429 || error.status === 503) {
      return true; // Rate limit or service unavailable
    }

    if (error.message?.includes('ECONNRESET')) {
      return true; // Connection reset
    }

    return false;
  }

  /**
   * Check if error is critical (should stop indexer)
   */
  static isCritical(error: any): boolean {
    if (error.message?.includes('Invalid RPC response')) {
      return true;
    }

    if (error.message?.includes('Database connection failed')) {
      return true;
    }

    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return true; // Permission errors
    }

    return false;
  }

  /**
   * Get error severity level
   */
  static getSeverity(error: any): 'low' | 'medium' | 'high' | 'critical' {
    if (this.isCritical(error)) {
      return 'critical';
    }

    if (error.message?.includes('parse')) {
      return 'low'; // Parse errors are usually non-blocking
    }

    if (error.status === 429) {
      return 'medium'; // Rate limiting
    }

    if (this.isRetryable(error)) {
      return 'medium'; // Network errors
    }

    return 'high';
  }
}
