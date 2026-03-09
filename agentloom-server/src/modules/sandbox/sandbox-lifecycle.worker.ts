import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';

import { DockerService } from './docker.service';
import { SandboxService } from './sandbox.service';
import { SandboxLifecycleProducer } from './sandbox-lifecycle.producer';
import {
  SANDBOX_LIFECYCLE_QUEUE,
  type SandboxLifecycleJobData,
} from './sandbox.constants';
import {
  SandboxCreationException,
  SandboxTimeoutException,
} from './sandbox.exceptions';

const HOURS_TO_MS = 60 * 60 * 1000;

@Processor(SANDBOX_LIFECYCLE_QUEUE)
export class SandboxLifecycleWorker extends WorkerHost {
  private readonly logger = new Logger(SandboxLifecycleWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly dockerService: DockerService,
    private readonly sandboxService: SandboxService,
    private readonly lifecycleProducer: SandboxLifecycleProducer,
  ) {
    super();
  }

  async process(job: Job<SandboxLifecycleJobData>): Promise<void> {
    const { jobType } = job.data;

    switch (jobType) {
      case 'create':
        return this.handleCreate(job.data);
      case 'destroy':
        return this.handleDestroy(job.data);
      case 'timeout_check':
        return this.handleTimeoutCheck(job.data);
    }
  }

  private async handleCreate(data: SandboxLifecycleJobData): Promise<void> {
    const { sessionId, executionId, tenantId, config } = data;

    if (!config) {
      throw new SandboxCreationException('Missing config in create job data');
    }

    const { containerId } = await this.dockerService.createContainer(
      sessionId,
      config,
    );

    await runInTenantTransaction(this.db, tenantId, async () => {
      const tenantDb = getTenantDb(this.db);
      await tenantDb
        .update(schema.sandboxSessions)
        .set({
          containerId,
          status: 'ready',
          startedAt: new Date(),
        })
        .where(eq(schema.sandboxSessions.id, sessionId));
    });

    await this.dockerService.attachLogs(containerId, (level, message) => {
      this.insertLog(sessionId, level, message, tenantId).catch((err) => {
        this.logger.error(`Failed to insert log for session ${sessionId}`, err);
      });
    });

    const delayMs = config.timeout * HOURS_TO_MS;
    await this.lifecycleProducer.addTimeoutCheckTask({
      sessionId,
      executionId,
      tenantId,
      delayMs,
    });

    this.logger.log(
      `Sandbox ${sessionId} created with container ${containerId}`,
    );
  }

  private async handleDestroy(data: SandboxLifecycleJobData): Promise<void> {
    const { sessionId, containerId, tenantId } = data;

    if (containerId) {
      await this.dockerService.stopContainer(containerId);
      await this.dockerService.removeContainer(containerId);
    }

    await runInTenantTransaction(this.db, tenantId, async () => {
      const tenantDb = getTenantDb(this.db);
      await tenantDb
        .update(schema.sandboxSessions)
        .set({
          status: 'stopped',
          stoppedAt: new Date(),
        })
        .where(eq(schema.sandboxSessions.id, sessionId));
    });

    this.logger.log(`Sandbox ${sessionId} destroyed`);
  }

  private async handleTimeoutCheck(
    data: SandboxLifecycleJobData,
  ): Promise<void> {
    const { sessionId, executionId, tenantId } = data;

    const session = await this.sandboxService.getSandboxSession(executionId);
    if (!session || session.status === 'stopped' || session.status === 'failed') {
      return;
    }

    this.logger.warn(`Sandbox ${sessionId} timed out, force stopping`);

    if (session.containerId) {
      await this.dockerService.stopContainer(session.containerId);
      await this.dockerService.removeContainer(session.containerId);
    }

    await runInTenantTransaction(this.db, tenantId, async () => {
      const tenantDb = getTenantDb(this.db);
      await tenantDb
        .update(schema.sandboxSessions)
        .set({
          status: 'failed',
          stoppedAt: new Date(),
        })
        .where(eq(schema.sandboxSessions.id, sessionId));
    });

    throw new SandboxTimeoutException(
      `Sandbox ${sessionId} exceeded timeout limit`,
    );
  }

  private async insertLog(
    sessionId: string,
    level: string,
    message: string,
    tenantId: string,
  ): Promise<void> {
    await runInTenantTransaction(this.db, tenantId, async () => {
      const tenantDb = getTenantDb(this.db);
      await tenantDb.insert(schema.sandboxLogs).values({
        sessionId,
        level,
        message,
      });
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SandboxLifecycleJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.data.jobType}) failed for session ${job.data.sessionId}: ${error.message}`,
      error.stack,
    );
  }
}
