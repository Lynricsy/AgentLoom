import { getQueueToken } from '@nestjs/bullmq';
import { Dependencies, Injectable, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  AGENT_API_MAINTENANCE_INTERVAL_MS,
  AGENT_API_MAINTENANCE_JOB_ID,
  AGENT_API_MAINTENANCE_JOB_NAME,
  AGENT_API_MAINTENANCE_QUEUE,
} from './agent-api-runtime.constants';

@Injectable()
@Dependencies(getQueueToken(AGENT_API_MAINTENANCE_QUEUE))
export class AgentApiMaintenanceScheduler implements OnModuleInit {
  constructor(private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      AGENT_API_MAINTENANCE_JOB_ID,
      { every: AGENT_API_MAINTENANCE_INTERVAL_MS },
      { name: AGENT_API_MAINTENANCE_JOB_NAME },
    );
  }
}
