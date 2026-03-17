import { getQueueToken } from '@nestjs/bullmq';
import { Dependencies, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  OPTIMIZATION_ANALYSIS_JOB_ID,
  OPTIMIZATION_ANALYSIS_JOB_NAME,
  OPTIMIZATION_ANALYSIS_QUEUE,
} from './optimization-analysis.constants';

@Injectable()
@Dependencies(getQueueToken(OPTIMIZATION_ANALYSIS_QUEUE))
export class OptimizationAnalysisScheduler implements OnModuleInit {
  constructor(private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      OPTIMIZATION_ANALYSIS_JOB_ID,
      {
        pattern: '0 2 * * 1',
        tz: 'UTC',
      },
      {
        name: OPTIMIZATION_ANALYSIS_JOB_NAME,
        data: {},
      },
    );
  }
}
