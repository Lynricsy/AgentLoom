import { getQueueToken } from '@nestjs/bullmq';
import { Dependencies, Injectable, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  TEAM_RUNTIME_QUEUE,
  TEAM_SWEEP_INTERVAL_MS,
  TEAM_SWEEP_JOB_ID,
  TEAM_SWEEP_JOB_NAME,
} from './team.constants';

@Injectable()
@Dependencies(getQueueToken(TEAM_RUNTIME_QUEUE))
export class TeamRuntimeScheduler implements OnModuleInit {
  constructor(private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      TEAM_SWEEP_JOB_ID,
      { every: TEAM_SWEEP_INTERVAL_MS },
      { name: TEAM_SWEEP_JOB_NAME },
    );
  }
}
