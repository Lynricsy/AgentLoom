import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, type Job } from 'bullmq';

import type { SandboxConfig } from '../../database/schema';
import {
  SANDBOX_LIFECYCLE_QUEUE,
  type SandboxLifecycleJobData,
} from './sandbox.constants';

@Injectable()
export class SandboxLifecycleProducer {
  constructor(
    @InjectQueue(SANDBOX_LIFECYCLE_QUEUE)
    private readonly queue: Queue<SandboxLifecycleJobData>,
  ) {}

  async addCreateTask(params: {
    sessionId: string;
    executionId: string;
    config: SandboxConfig;
    tenantId: string;
  }): Promise<Job<SandboxLifecycleJobData>> {
    return this.queue.add('sandbox-create', {
      sessionId: params.sessionId,
      executionId: params.executionId,
      tenantId: params.tenantId,
      jobType: 'create',
      config: params.config,
    });
  }

  async addDestroyTask(params: {
    sessionId: string;
    executionId: string;
    containerId?: string;
    persistencePath?: string;
    tenantId: string;
  }): Promise<Job<SandboxLifecycleJobData>> {
    return this.queue.add('sandbox-destroy', {
      sessionId: params.sessionId,
      executionId: params.executionId,
      tenantId: params.tenantId,
      jobType: 'destroy',
      ...(params.containerId ? { containerId: params.containerId } : {}),
      ...(params.persistencePath
        ? { persistencePath: params.persistencePath }
        : {}),
    });
  }

  async addTimeoutCheckTask(params: {
    sessionId: string;
    executionId: string;
    tenantId: string;
    delayMs: number;
  }): Promise<Job<SandboxLifecycleJobData>> {
    return this.queue.add(
      'sandbox-timeout-check',
      {
        sessionId: params.sessionId,
        executionId: params.executionId,
        tenantId: params.tenantId,
        jobType: 'timeout_check',
      },
      {
        attempts: 1,
        delay: params.delayMs,
        jobId: `sandbox-timeout:${params.sessionId}`,
      },
    );
  }
}
