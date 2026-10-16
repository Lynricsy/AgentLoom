import { getQueueToken } from '@nestjs/bullmq';
import { Dependencies, Injectable, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  OPTIMIZATION_ANALYZE_CRON,
  OPTIMIZATION_ANALYZE_JOB_NAME,
  OPTIMIZATION_ANALYZE_SCHEDULER_ID,
  OPTIMIZATION_QUEUE,
  OPTIMIZATION_SWEEP_INTERVAL_MS,
  OPTIMIZATION_SWEEP_JOB_NAME,
  OPTIMIZATION_SWEEP_SCHEDULER_ID,
} from './optimization-proposal.constants';

@Injectable()
@Dependencies(getQueueToken(OPTIMIZATION_QUEUE))
export class OptimizationProposalScheduler implements OnModuleInit {
  constructor(private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      OPTIMIZATION_ANALYZE_SCHEDULER_ID,
      { pattern: OPTIMIZATION_ANALYZE_CRON, tz: 'UTC' },
      { name: OPTIMIZATION_ANALYZE_JOB_NAME, data: {} },
    );
    await this.queue.upsertJobScheduler(
      OPTIMIZATION_SWEEP_SCHEDULER_ID,
      { every: OPTIMIZATION_SWEEP_INTERVAL_MS },
      { name: OPTIMIZATION_SWEEP_JOB_NAME },
    );
  }
}
