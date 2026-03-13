import type { JobsOptions } from 'bullmq';

export const NOTIFICATION_QUEUE = 'notification';

export const NOTIFICATION_DISPATCH_JOB = 'dispatch-notification';

export const NOTIFICATION_CHANNEL_PUSH = 'push';

export const NOTIFICATION_QUEUE_DEFAULT_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: 100,
  removeOnFail: 500,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
};

export interface NotificationDispatchJobData {
  tenantId: string;
  userId: string;
  notificationId: string;
  type: string;
}
