import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, type Job } from 'bullmq';

import type { SandboxConfig } from '../../database/schema';
import type { PiConfigInput } from './pi-config-generator.service';
import {
  SANDBOX_LIFECYCLE_QUEUE,
  type SandboxLifecycleBinding,
  type SandboxLifecycleJobData,
} from './sandbox.constants';

type SandboxLifecycleTaskParams = SandboxLifecycleBinding & {
  sessionId: string;
  tenantId: string;
};

@Injectable()
export class SandboxLifecycleProducer {
  constructor(
    @InjectQueue(SANDBOX_LIFECYCLE_QUEUE)
    private readonly queue: Queue<SandboxLifecycleJobData>,
  ) {}

  async addCreateTask(params: {
    sessionId: string;
    executionId?: string;
    agentConversationId?: string;
    config: SandboxConfig;
    tenantId: string;
    piConfigInput?: PiConfigInput;
  }): Promise<Job<SandboxLifecycleJobData>> {
    return this.queue.add('sandbox-create', {
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      jobType: 'create',
      config: params.config,
      ...(params.piConfigInput ? { piConfigInput: params.piConfigInput } : {}),
      ...this.buildBinding(params),
    });
  }

  async addDestroyTask(params: {
    sessionId: string;
    executionId?: string;
    agentConversationId?: string;
    containerId?: string;
    persistencePath?: string;
    tenantId: string;
  }): Promise<Job<SandboxLifecycleJobData>> {
    return this.queue.add('sandbox-destroy', {
      sessionId: params.sessionId,
      tenantId: params.tenantId,
      jobType: 'destroy',
      ...this.buildBinding(params),
      ...(params.containerId ? { containerId: params.containerId } : {}),
      ...(params.persistencePath
        ? { persistencePath: params.persistencePath }
        : {}),
    });
  }

  async addTimeoutCheckTask(params: {
    sessionId: string;
    executionId?: string;
    agentConversationId?: string;
    tenantId: string;
    delayMs: number;
  }): Promise<Job<SandboxLifecycleJobData>> {
    return this.queue.add(
      'sandbox-timeout-check',
      {
        sessionId: params.sessionId,
        tenantId: params.tenantId,
        jobType: 'timeout_check',
        ...this.buildBinding(params),
      },
      {
        attempts: 1,
        delay: params.delayMs,
        jobId: `sandbox-timeout-${params.sessionId}`,
      },
    );
  }

  private buildBinding(
    params: SandboxLifecycleTaskParams,
  ): SandboxLifecycleBinding {
    return {
      ...(typeof params.executionId === 'string'
        ? { executionId: params.executionId }
        : {}),
      ...(typeof params.agentConversationId === 'string'
        ? { agentConversationId: params.agentConversationId }
        : {}),
    };
  }
}
