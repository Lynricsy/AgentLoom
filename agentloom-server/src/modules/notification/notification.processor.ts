import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { NotificationGateway } from './notification.gateway';
import {
  NOTIFICATION_CHANNEL_PUSH,
  NOTIFICATION_DISPATCH_JOB,
  NOTIFICATION_QUEUE,
  type NotificationDispatchJobData,
} from './notification.constants';
import {
  PushNotificationService,
  type PushNotificationPayload,
} from './push-notification.service';
import { NotificationService } from './notification.service';

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
    private readonly pushNotificationService: PushNotificationService,
  ) {
    super();
  }

  async process(
    job: Job<NotificationDispatchJobData>,
  ): Promise<{ pushed: boolean }> {
    if (job.name !== NOTIFICATION_DISPATCH_JOB) {
      return { pushed: false };
    }

    return runInTenantTransaction(this.db, job.data.tenantId, async () => {
      const notification = await this.notificationService.getById(
        job.data.tenantId,
        job.data.userId,
        job.data.notificationId,
      );

      if (!notification) {
        return { pushed: false };
      }

      const inAppPreference =
        await this.notificationService.getPreferenceForChannel(
          job.data.tenantId,
          job.data.userId,
          job.data.type,
          'in_app',
        );
      const inAppEnabled = !inAppPreference || inAppPreference.enabled;

      if (inAppEnabled) {
        this.notificationGateway.sendToUser(
          job.data.tenantId,
          job.data.userId,
          notification,
        );
      }

      const pushPreference =
        await this.notificationService.getPreferenceForChannel(
          job.data.tenantId,
          job.data.userId,
          job.data.type,
          NOTIFICATION_CHANNEL_PUSH,
        );
      const pushEnabled = !pushPreference || pushPreference.enabled;

      if (pushEnabled) {
        await this.pushNotificationService.sendToUser(
          job.data.userId,
          this.buildPushPayload(notification),
        );
      }

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

  private buildPushPayload(
    notification: schema.Notification,
  ): PushNotificationPayload {
    const body = this.asRecord(notification.body);
    const payload: PushNotificationPayload = {
      title: notification.title,
      body: typeof body?.message === 'string' ? body.message : '',
      data: {
        type: notification.type,
        notificationId: notification.id,
      },
    };

    const executionId = this.toDataString(body?.executionId);
    if (executionId) {
      payload.data!.executionId = executionId;
    }

    const workflowId = this.toDataString(body?.workflowId);
    if (workflowId) {
      payload.data!.workflowId = workflowId;
    }

    const nodeId = this.toDataString(body?.nodeId);
    if (nodeId) {
      payload.data!.nodeId = nodeId;
    }

    return payload;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private toDataString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    return undefined;
  }
}
