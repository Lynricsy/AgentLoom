import { getQueueToken } from '@nestjs/bullmq';
import { Dependencies, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  EVIDENCE_EXPORT_CLEANUP_BATCH_SIZE,
  EVIDENCE_EXPORT_CLEANUP_JOB_ID,
  EVIDENCE_EXPORT_CLEANUP_JOB_NAME,
  EVIDENCE_EXPORT_CLEANUP_QUEUE,
  EVIDENCE_EXPORT_CLEANUP_SCHEDULE,
} from './evidence-export.constants';

@Injectable()
@Dependencies(getQueueToken(EVIDENCE_EXPORT_CLEANUP_QUEUE))
export class EvidenceExportCleanupScheduler implements OnModuleInit {
  constructor(private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      EVIDENCE_EXPORT_CLEANUP_JOB_ID,
      {
        pattern: EVIDENCE_EXPORT_CLEANUP_SCHEDULE,
        tz: 'UTC',
      },
      {
        name: EVIDENCE_EXPORT_CLEANUP_JOB_NAME,
        data: {
          batchSize: EVIDENCE_EXPORT_CLEANUP_BATCH_SIZE,
        },
      },
    );
  }
}
