import { getQueueToken } from '@nestjs/bullmq';
import { Dependencies, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  AUDIT_LOG_RETENTION_BATCH_SIZE,
  AUDIT_LOG_RETENTION_JOB_ID,
  AUDIT_LOG_RETENTION_JOB_NAME,
  AUDIT_LOG_RETENTION_QUEUE,
  AUDIT_LOG_RETENTION_SCHEDULE,
  AUDIT_LOG_RETENTION_WINDOW_DAYS,
} from './audit-log-retention.constants';

@Injectable()
@Dependencies(getQueueToken(AUDIT_LOG_RETENTION_QUEUE))
export class AuditLogRetentionScheduler implements OnModuleInit {
  constructor(private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      AUDIT_LOG_RETENTION_JOB_ID,
      {
        pattern: AUDIT_LOG_RETENTION_SCHEDULE,
        tz: 'UTC',
      },
      {
        name: AUDIT_LOG_RETENTION_JOB_NAME,
        data: {
          retentionDays: AUDIT_LOG_RETENTION_WINDOW_DAYS,
          batchSize: AUDIT_LOG_RETENTION_BATCH_SIZE,
        },
      },
    );
  }
}
