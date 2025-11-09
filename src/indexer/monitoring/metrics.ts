import { logger } from '@/utils/logger';

export interface Metrics {
  eventsProcessedTotal: number;
  indexerLagSeconds: number;
  batchSizeAvg: number;
  indexerErrorsTotal: number;
  blockchainRpcLatencyMs: number[];
  databaseWriteLatencyMs: number[];
  lastUpdated: Date;
}

/**
 * Metrics collector for Prometheus monitoring
 */
export class MetricsCollector {
  private metrics: Metrics = {
    eventsProcessedTotal: 0,
    indexerLagSeconds: 0,
    batchSizeAvg: 0,
    indexerErrorsTotal: 0,
    blockchainRpcLatencyMs: [],
    databaseWriteLatencyMs: [],
    lastUpdated: new Date(),
  };

  private batchSizes: number[] = [];
  private maxHistorySize: number = 100;

  /**
   * Increment events processed counter
   */
  incrementEventsProcessed(count: number = 1): void {
    this.metrics.eventsProcessedTotal += count;
    this.metrics.lastUpdated = new Date();
  }

  /**
   * Update indexer lag
   */
  updateIndexerLag(lagSeconds: number): void {
    this.metrics.indexerLagSeconds = lagSeconds;
    this.metrics.lastUpdated = new Date();
  }

  /**
   * Record batch size
   */
  recordBatchSize(size: number): void {
    this.batchSizes.push(size);
    if (this.batchSizes.length > this.maxHistorySize) {
      this.batchSizes = this.batchSizes.slice(-this.maxHistorySize);
    }
    this.metrics.batchSizeAvg =
      this.batchSizes.reduce((a, b) => a + b, 0) / this.batchSizes.length;
    this.metrics.lastUpdated = new Date();
  }

  /**
   * Increment errors counter
   */
  incrementErrors(count: number = 1): void {
    this.metrics.indexerErrorsTotal += count;
    this.metrics.lastUpdated = new Date();
  }

  /**
   * Record blockchain RPC latency
   */
  recordBlockchainLatency(latencyMs: number): void {
    this.metrics.blockchainRpcLatencyMs.push(latencyMs);
    if (this.metrics.blockchainRpcLatencyMs.length > this.maxHistorySize) {
      this.metrics.blockchainRpcLatencyMs = this.metrics.blockchainRpcLatencyMs.slice(
        -this.maxHistorySize,
      );
    }
    this.metrics.lastUpdated = new Date();
  }

  /**
   * Record database write latency
   */
  recordDatabaseLatency(latencyMs: number): void {
    this.metrics.databaseWriteLatencyMs.push(latencyMs);
    if (this.metrics.databaseWriteLatencyMs.length > this.maxHistorySize) {
      this.metrics.databaseWriteLatencyMs = this.metrics.databaseWriteLatencyMs.slice(
        -this.maxHistorySize,
      );
    }
    this.metrics.lastUpdated = new Date();
  }

  /**
   * Get current metrics
   */
  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // Counter: events processed
    lines.push('# HELP indexer_events_processed_total Total events processed by indexer');
    lines.push('# TYPE indexer_events_processed_total counter');
    lines.push(`indexer_events_processed_total ${this.metrics.eventsProcessedTotal}`);

    // Gauge: indexer lag
    lines.push('# HELP indexer_lag_seconds Current indexer lag in seconds');
    lines.push('# TYPE indexer_lag_seconds gauge');
    lines.push(`indexer_lag_seconds ${this.metrics.indexerLagSeconds}`);

    // Gauge: batch size average
    lines.push('# HELP indexer_batch_size_avg Average batch size');
    lines.push('# TYPE indexer_batch_size_avg gauge');
    lines.push(`indexer_batch_size_avg ${this.metrics.batchSizeAvg.toFixed(2)}`);

    // Counter: errors
    lines.push('# HELP indexer_errors_total Total errors in indexer');
    lines.push('# TYPE indexer_errors_total counter');
    lines.push(`indexer_errors_total ${this.metrics.indexerErrorsTotal}`);

    // Histogram: blockchain RPC latency
    if (this.metrics.blockchainRpcLatencyMs.length > 0) {
      lines.push('# HELP blockchain_rpc_latency_ms Blockchain RPC latency in milliseconds');
      lines.push('# TYPE blockchain_rpc_latency_ms histogram');
      const avgLatency =
        this.metrics.blockchainRpcLatencyMs.reduce((a, b) => a + b, 0) /
        this.metrics.blockchainRpcLatencyMs.length;
      const maxLatency = Math.max(...this.metrics.blockchainRpcLatencyMs);
      const minLatency = Math.min(...this.metrics.blockchainRpcLatencyMs);
      lines.push(`blockchain_rpc_latency_ms_bucket{le="10"} ${this.countBelow(this.metrics.blockchainRpcLatencyMs, 10)}`);
      lines.push(`blockchain_rpc_latency_ms_bucket{le="50"} ${this.countBelow(this.metrics.blockchainRpcLatencyMs, 50)}`);
      lines.push(`blockchain_rpc_latency_ms_bucket{le="100"} ${this.countBelow(this.metrics.blockchainRpcLatencyMs, 100)}`);
      lines.push(`blockchain_rpc_latency_ms_bucket{le="+Inf"} ${this.metrics.blockchainRpcLatencyMs.length}`);
      lines.push(`blockchain_rpc_latency_ms_sum ${this.metrics.blockchainRpcLatencyMs.reduce((a, b) => a + b, 0)}`);
      lines.push(`blockchain_rpc_latency_ms_count ${this.metrics.blockchainRpcLatencyMs.length}`);
    }

    // Histogram: database write latency
    if (this.metrics.databaseWriteLatencyMs.length > 0) {
      lines.push('# HELP database_write_latency_ms Database write latency in milliseconds');
      lines.push('# TYPE database_write_latency_ms histogram');
      lines.push(`database_write_latency_ms_bucket{le="10"} ${this.countBelow(this.metrics.databaseWriteLatencyMs, 10)}`);
      lines.push(`database_write_latency_ms_bucket{le="50"} ${this.countBelow(this.metrics.databaseWriteLatencyMs, 50)}`);
      lines.push(`database_write_latency_ms_bucket{le="100"} ${this.countBelow(this.metrics.databaseWriteLatencyMs, 100)}`);
      lines.push(`database_write_latency_ms_bucket{le="+Inf"} ${this.metrics.databaseWriteLatencyMs.length}`);
      lines.push(`database_write_latency_ms_sum ${this.metrics.databaseWriteLatencyMs.reduce((a, b) => a + b, 0)}`);
      lines.push(`database_write_latency_ms_count ${this.metrics.databaseWriteLatencyMs.length}`);
    }

    // Timestamp
    lines.push(`# Last updated: ${this.metrics.lastUpdated.toISOString()}`);

    return lines.join('\n');
  }

  /**
   * Count values below threshold
   */
  private countBelow(values: number[], threshold: number): number {
    return values.filter((v) => v <= threshold).length;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      eventsProcessedTotal: 0,
      indexerLagSeconds: 0,
      batchSizeAvg: 0,
      indexerErrorsTotal: 0,
      blockchainRpcLatencyMs: [],
      databaseWriteLatencyMs: [],
      lastUpdated: new Date(),
    };
    this.batchSizes = [];
  }
}
