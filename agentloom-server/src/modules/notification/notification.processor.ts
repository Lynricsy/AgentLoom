import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { NotificationGateway } from './notification.gateway';
import {
  NOTIFICATION_QUEUE,
  type NotificationDispatchJobData,
} from './notification.constants';
import { NotificationService } from './notification.service';

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(_job: Job<NotificationDispatchJobData>): Promise<{ pushed: boolean }> {
    void this.notificationService;
    void this.notificationGateway;
    return { pushed: false };
  }
}
