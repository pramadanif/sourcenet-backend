import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import prisma from '@/config/database';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { performance } from 'perf_hooks';

interface NotificationJobData {
  purchase_id: string;
  seller_address: string;
  buyer_address: string;
  event_type: 'purchase.completed' | 'purchase.failed' | 'review.received';
  metadata?: {
    price_sui?: number;
    datapod_title?: string;
    seller_email?: string;
    buyer_email?: string;
  };
}

let notificationQueue: Queue<NotificationJobData> | null = null;
let notificationWorker: Worker<NotificationJobData> | null = null;

/**
 * Initialize notification queue
 */
export const initializeNotificationQueue = async (): Promise<Queue<NotificationJobData>> => {
  if (notificationQueue) {
    return notificationQueue;
  }

  try {
    const redisConnection = new Redis({
      host: new URL(env.REDIS_URL).hostname || 'localhost',
      port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    notificationQueue = new Queue<NotificationJobData>('notification', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    logger.info('Notification queue initialized');
    return notificationQueue;
  } catch (error) {
    logger.error('Failed to initialize notification queue', { error });
    throw error;
  }
};

/**
 * Start notification worker
 */
export const startNotificationWorker = async (): Promise<void> => {
  try {
    const queue = await initializeNotificationQueue();

    const redisConnection = new Redis({
      host: new URL(env.REDIS_URL).hostname || 'localhost',
      port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      maxRetriesPerRequest: null,
    });

    notificationWorker = new Worker<NotificationJobData>(
      'notification',
      async (job: Job<NotificationJobData>) => {
        return await processNotificationJob(job);
      },
      {
        connection: redisConnection,
        concurrency: 10,
      },
    );

    notificationWorker.on('completed', (job: Job) => {
      logger.info('Notification job completed', { jobId: job.id });
    });

    notificationWorker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Notification job failed', { jobId: job?.id, error: error.message });
    });

    logger.info('Notification worker started');
  } catch (error) {
    logger.error('Failed to start notification worker', { error });
    throw error;
  }
};

/**
 * Send email notification
 */
async function sendEmailNotification(
  recipientEmail: string,
  subject: string,
  body: string,
): Promise<void> {
  try {
    // TODO: Integrate with nodemailer or email service
    // For now, log the email that would be sent
    logger.info('Email notification queued', {
      recipient: recipientEmail,
      subject,
      preview: body.substring(0, 100),
    });

    // Example implementation with nodemailer:
    // const transporter = nodemailer.createTransport({
    //   service: 'gmail',
    //   auth: {
    //     user: env.EMAIL_USER,
    //     pass: env.EMAIL_PASSWORD,
    //   },
    // });
    //
    // await transporter.sendMail({
    //   from: env.EMAIL_FROM,
    //   to: recipientEmail,
    //   subject,
    //   html: body,
    // });
  } catch (error) {
    logger.error('Failed to send email notification', { error, recipientEmail });
    throw error;
  }
}

/**
 * Create in-app notification
 */
async function createInAppNotification(
  userId: string,
  title: string,
  message: string,
  type: 'success' | 'info' | 'warning' | 'error',
): Promise<void> {
  try {
    // TODO: Create notification model in Prisma and store
    logger.info('In-app notification created', {
      userId,
      title,
      message,
      type,
    });

    // Example implementation:
    // await prisma.notification.create({
    //   data: {
    //     userId,
    //     title,
    //     message,
    //     type,
    //     read: false,
    //     createdAt: new Date(),
    //   },
    // });
  } catch (error) {
    logger.error('Failed to create in-app notification', { error, userId });
    throw error;
  }
}

/**
 * Send Slack/Discord webhook notification
 */
async function sendWebhookNotification(
  webhookUrl: string,
  message: string,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    // TODO: Implement webhook notification
    logger.info('Webhook notification queued', {
      webhookUrl: webhookUrl.substring(0, 50) + '...',
      message,
      metadata,
    });
  } catch (error) {
    logger.error('Failed to send webhook notification', { error });
    throw error;
  }
}

/**
 * Process notification job
 */
const processNotificationJob = async (job: Job<NotificationJobData>): Promise<void> => {
  const { purchase_id, seller_address, buyer_address, event_type, metadata } = job.data;
  const startTime = performance.now();

  logger.info('Processing notification job', {
    jobId: job.id,
    purchaseId: purchase_id,
    eventType: event_type,
  });

  try {
    // Fetch purchase and related data
    const purchase = await prisma.purchaseRequest.findUnique({
      where: { id: purchase_id },
      include: {
        datapod: true,
        buyer: true,
      },
    });

    if (!purchase) {
      throw new Error(`Purchase not found: ${purchase_id}`);
    }

    const seller = await prisma.user.findUnique({
      where: { zkloginAddress: seller_address },
    });

    const buyer = await prisma.user.findUnique({
      where: { zkloginAddress: buyer_address },
    });

    if (!seller || !buyer) {
      throw new Error('Seller or buyer not found');
    }

    // Handle different event types
    switch (event_type) {
      case 'purchase.completed': {
        const price = metadata?.price_sui || purchase.priceSui.toNumber();
        const title = metadata?.datapod_title || purchase.datapod?.title || 'Your Data';

        // Notify seller
        if (seller.googleEmail) {
          await sendEmailNotification(
            seller.googleEmail,
            '🎉 Your Data Sold!',
            `<p>Congratulations! Your data "${title}" has been sold.</p>
             <p><strong>Amount Received: +${price} SUI</strong></p>
             <p>The buyer has received their encrypted copy and payment has been released to your account.</p>`,
          );
        }

        await createInAppNotification(
          seller.id,
          'Data Sold',
          `Your data "${title}" sold for ${price} SUI`,
          'success',
        );

        // Notify buyer
        if (buyer.googleEmail) {
          await sendEmailNotification(
            buyer.googleEmail,
            '📦 Your Purchase is Ready',
            `<p>Your purchase of "${title}" is complete!</p>
             <p>Your encrypted data is ready for download in your account.</p>
             <p>Only you can decrypt this data with your private key.</p>`,
          );
        }

        await createInAppNotification(
          buyer.id,
          'Purchase Complete',
          `Your purchase of "${title}" is ready for download`,
          'success',
        );

        break;
      }

      case 'purchase.failed': {
        const title = metadata?.datapod_title || purchase.datapod?.title || 'Your Data';

        // Notify buyer of failure
        if (buyer.googleEmail) {
          await sendEmailNotification(
            buyer.googleEmail,
            '❌ Purchase Failed',
            `<p>Unfortunately, your purchase of "${title}" could not be completed.</p>
             <p>Your payment has been refunded. Please try again later.</p>`,
          );
        }

        await createInAppNotification(
          buyer.id,
          'Purchase Failed',
          `Your purchase of "${title}" failed and has been refunded`,
          'error',
        );

        break;
      }

      case 'review.received': {
        // Notify seller of new review
        if (seller.googleEmail) {
          await sendEmailNotification(
            seller.googleEmail,
            '⭐ New Review Received',
            `<p>You received a new review for your data listing.</p>
             <p>Check your dashboard to see the feedback.</p>`,
          );
        }

        await createInAppNotification(
          seller.id,
          'New Review',
          'You received a new review for your data',
          'info',
        );

        break;
      }
    }

    const duration = performance.now() - startTime;
    logger.info('Notification job completed successfully', {
      jobId: job.id,
      purchaseId: purchase_id,
      duration: Math.round(duration),
    });
  } catch (error) {
    logger.error('Notification job processing failed', {
      jobId: job.id,
      purchaseId: purchase_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

/**
 * Queue notification job
 */
export const queueNotificationJob = async (
  data: NotificationJobData,
): Promise<Job<NotificationJobData>> => {
  try {
    const queue = await initializeNotificationQueue();
    const job = await queue.add('notify', data, {
      jobId: `notify-${data.purchase_id}-${Date.now()}`,
      priority: 5,
    });

    logger.info('Notification job queued', {
      jobId: job.id,
      purchaseId: data.purchase_id,
    });

    return job;
  } catch (error) {
    logger.error('Failed to queue notification job', { error });
    throw error;
  }
};

/**
 * Get notification queue
 */
export const getNotificationQueue = async (): Promise<Queue<NotificationJobData>> => {
  return await initializeNotificationQueue();
};

/**
 * Shutdown notification queue and worker
 */
export const shutdownNotificationQueue = async (): Promise<void> => {
  try {
    if (notificationWorker) {
      await notificationWorker.close();
      notificationWorker = null;
    }

    if (notificationQueue) {
      await notificationQueue.close();
      notificationQueue = null;
    }

    logger.info('Notification queue and worker shut down');
  } catch (error) {
    logger.error('Error shutting down notification queue', { error });
  }
};
