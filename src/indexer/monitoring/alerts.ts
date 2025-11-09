import axios from 'axios';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';

export interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  details?: any;
  timestamp: Date;
  resolved?: boolean;
}

export interface AlertConfig {
  slackWebhookUrl?: string;
  emailRecipients?: string[];
  enableSlack?: boolean;
  enableEmail?: boolean;
}

/**
 * Alert manager for sending notifications
 */
export class AlertManager {
  private config: AlertConfig;
  private alertHistory: Alert[] = [];
  private maxHistorySize: number = 1000;
  private activeAlerts: Map<string, Alert> = new Map();

  constructor(config: AlertConfig = {}) {
    this.config = {
      enableSlack: config.enableSlack ?? true,
      enableEmail: config.enableEmail ?? false,
      ...config,
    };
  }

  /**
   * Send alert
   */
  async sendAlert(alert: Alert): Promise<void> {
    try {
      // Add to history
      this.alertHistory.push(alert);
      if (this.alertHistory.length > this.maxHistorySize) {
        this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
      }

      // Track active alerts
      if (!alert.resolved) {
        this.activeAlerts.set(alert.id, alert);
      } else {
        this.activeAlerts.delete(alert.id);
      }

      logger.warn('Alert triggered', {
        id: alert.id,
        severity: alert.severity,
        title: alert.title,
      });

      // Send notifications based on severity
      if (alert.severity === 'critical' || alert.severity === 'high') {
        if (this.config.enableSlack) {
          await this.sendSlackAlert(alert);
        }
        if (this.config.enableEmail) {
          await this.sendEmailAlert(alert);
        }
      } else if (alert.severity === 'medium') {
        if (this.config.enableSlack) {
          await this.sendSlackAlert(alert);
        }
      }
    } catch (error) {
      logger.error('Failed to send alert', { error, alertId: alert.id });
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackAlert(alert: Alert): Promise<void> {
    if (!this.config.slackWebhookUrl) {
      logger.warn('Slack webhook URL not configured');
      return;
    }

    try {
      const color = this.getSeverityColor(alert.severity);
      const payload = {
        attachments: [
          {
            color,
            title: `🚨 ${alert.title}`,
            text: alert.message,
            fields: [
              {
                title: 'Severity',
                value: alert.severity.toUpperCase(),
                short: true,
              },
              {
                title: 'Alert ID',
                value: alert.id,
                short: true,
              },
              {
                title: 'Timestamp',
                value: alert.timestamp.toISOString(),
                short: true,
              },
            ],
            footer: 'SourceNet Indexer',
            ts: Math.floor(alert.timestamp.getTime() / 1000),
          },
        ],
      };

      if (alert.details) {
        payload.attachments[0].fields.push({
          title: 'Details',
          value: JSON.stringify(alert.details, null, 2),
          short: false,
        });
      }

      await axios.post(this.config.slackWebhookUrl, payload, {
        timeout: 5000,
      });

      logger.debug('Slack alert sent', { alertId: alert.id });
    } catch (error) {
      logger.error('Failed to send Slack alert', { error, alertId: alert.id });
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailAlert(alert: Alert): Promise<void> {
    if (!this.config.emailRecipients || this.config.emailRecipients.length === 0) {
      logger.warn('Email recipients not configured');
      return;
    }

    try {
      // This is a placeholder for email sending
      // In production, integrate with SendGrid, AWS SES, or similar
      logger.info('Email alert would be sent', {
        alertId: alert.id,
        recipients: this.config.emailRecipients,
      });
    } catch (error) {
      logger.error('Failed to send email alert', { error, alertId: alert.id });
    }
  }

  /**
   * Get color for severity level
   */
  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return '#FF0000'; // Red
      case 'high':
        return '#FF6600'; // Orange
      case 'medium':
        return '#FFCC00'; // Yellow
      case 'low':
        return '#0099FF'; // Blue
      default:
        return '#999999'; // Gray
    }
  }

  /**
   * Create indexer lag alert
   */
  createLagAlert(lagSeconds: number, threshold: number): Alert {
    const severity = lagSeconds > threshold * 2 ? 'critical' : 'high';
    return {
      id: `lag-${Date.now()}`,
      severity,
      title: 'Indexer Lag Alert',
      message: `Processing lag is ${lagSeconds} seconds (threshold: ${threshold}s)`,
      details: { lagSeconds, threshold },
      timestamp: new Date(),
    };
  }

  /**
   * Create error rate alert
   */
  createErrorRateAlert(errorRate: number, threshold: number): Alert {
    const severity = errorRate > threshold * 2 ? 'critical' : 'high';
    return {
      id: `error-rate-${Date.now()}`,
      severity,
      title: 'High Error Rate Alert',
      message: `Error rate is ${(errorRate * 100).toFixed(2)}% (threshold: ${(threshold * 100).toFixed(2)}%)`,
      details: { errorRate, threshold },
      timestamp: new Date(),
    };
  }

  /**
   * Create database latency alert
   */
  createDatabaseLatencyAlert(latencyMs: number, threshold: number): Alert {
    const severity = latencyMs > threshold * 2 ? 'critical' : 'high';
    return {
      id: `db-latency-${Date.now()}`,
      severity,
      title: 'Database Latency Alert',
      message: `Database write latency is ${latencyMs}ms (threshold: ${threshold}ms)`,
      details: { latencyMs, threshold },
      timestamp: new Date(),
    };
  }

  /**
   * Create RPC error alert
   */
  createRpcErrorAlert(errorCount: number, threshold: number): Alert {
    const severity = errorCount > threshold * 2 ? 'critical' : 'high';
    return {
      id: `rpc-error-${Date.now()}`,
      severity,
      title: 'RPC Error Alert',
      message: `${errorCount} RPC errors in last minute (threshold: ${threshold})`,
      details: { errorCount, threshold },
      timestamp: new Date(),
    };
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.activeAlerts.delete(alertId);
      logger.info('Alert resolved', { alertId });
    }
  }

  /**
   * Get alert statistics
   */
  getStatistics(): {
    totalAlerts: number;
    activeAlerts: number;
    criticalAlerts: number;
    highAlerts: number;
  } {
    const activeAlerts = Array.from(this.activeAlerts.values());
    return {
      totalAlerts: this.alertHistory.length,
      activeAlerts: activeAlerts.length,
      criticalAlerts: activeAlerts.filter((a) => a.severity === 'critical').length,
      highAlerts: activeAlerts.filter((a) => a.severity === 'high').length,
    };
  }
}
