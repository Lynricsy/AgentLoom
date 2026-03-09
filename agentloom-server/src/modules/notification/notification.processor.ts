import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { NotificationGateway } from './notification.gateway';
import {
  NOTIFICATION_DISPATCH_JOB,
  NOTIFICATION_QUEUE,
  type NotificationDispatchJobData,
} from './notification.constants';
import { NotificationService } from './notification.service';

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(job: Job<NotificationDispatchJobData>): Promise<{ pushed: boolean }> {
    if (job.name !== NOTIFICATION_DISPATCH_JOB) {
      return { pushed: false };
    }

    return runInTenantTransaction(this.db, job.data.tenantId, async () => {
      const preferences = await this.notificationService.getPreferences(
        job.data.tenantId,
        job.data.userId,
      );
      const pushPreference = preferences.find(
        (preference) =>
          preference.type === job.data.type && preference.channel === 'push',
      );

      if (pushPreference?.enabled === false) {
        return { pushed: false };
      }

      const notification = await this.notificationService.getById(
        job.data.tenantId,
        job.data.userId,
        job.data.notificationId,
      );

      if (!notification) {
        return { pushed: false };
      }

      this.notificationGateway.sendToUser(
        job.data.tenantId,
        job.data.userId,
        notification,
      );

      const unread = await this.notificationService.getUnreadCount(
        job.data.tenantId,
        job.data.userId,
      );
      this.notificationGateway.sendUnreadCount(
        job.data.tenantId,
        job.data.userId,
        unread.count,
      );

      return { pushed: true };
    });
  }
}
