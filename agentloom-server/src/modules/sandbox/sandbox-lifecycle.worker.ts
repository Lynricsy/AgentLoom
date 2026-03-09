import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import * as schema from '../../database/schema';
import { and, eq, inArray, notInArray } from 'drizzle-orm';

import { StorageService } from '../../infrastructure/storage/storage.service';
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
const CONTAINER_WORKSPACE = '/workspace/';
const ACTIVE_STEP_STATUSES = [
  'pending',
  'queued',
  'running',
  'waiting_intervention',
] as const;
const TERMINAL_SANDBOX_STATUSES = ['stopped', 'failed'] as const;

@Processor(SANDBOX_LIFECYCLE_QUEUE)
export class SandboxLifecycleWorker extends WorkerHost {
  private readonly logger = new Logger(SandboxLifecycleWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly dockerService: DockerService,
    private readonly sandboxService: SandboxService,
    private readonly lifecycleProducer: SandboxLifecycleProducer,
    private readonly storageService: StorageService,
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

    let containerId: string | undefined;

    try {
      const container = await this.dockerService.createContainer(sessionId, config);
      containerId = container.containerId;

      await runInTenantTransaction(this.db, tenantId, async () => {
        const tenantDb = getTenantDb(this.db);
        await tenantDb
          .update(schema.sandboxSessions)
          .set({
            containerId,
            status: 'ready',
            startedAt: new Date(),
            workspacePath: CONTAINER_WORKSPACE,
          })
          .where(eq(schema.sandboxSessions.id, sessionId));
      });

      await this.insertLog(
        sessionId,
        'system',
        `Sandbox container ${containerId} created`,
        tenantId,
      );

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
    } catch (error) {
      if (containerId) {
        await this.dockerService.removeContainer(containerId).catch((cleanupError) => {
          this.logger.warn(
            `Failed to cleanup container ${containerId} after sandbox creation error: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          );
        });
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

      await this.insertLog(
        sessionId,
        'system',
        `Sandbox creation failed: ${error instanceof Error ? error.message : String(error)}`,
        tenantId,
      );

      throw error;
    }
  }

  private async handleDestroy(data: SandboxLifecycleJobData): Promise<void> {
    const { sessionId, containerId, tenantId, persistencePath } = data;

    if (containerId) {
      if (persistencePath) {
        try {
          const archive = await this.dockerService.getArchive(
            containerId,
            CONTAINER_WORKSPACE,
          );
          const storageKey = `sandboxes/${tenantId}/${sessionId}/workspace.tar`;
          await this.storageService.upload(
            storageKey,
            archive,
            archive.length,
            'application/x-tar',
          );
          this.logger.log(
            `Workspace synced to MinIO for session ${sessionId}: ${storageKey}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to sync workspace for session ${sessionId}`,
            error instanceof Error ? error.stack : error,
          );
        }
      }

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

    await this.insertLog(sessionId, 'system', 'Sandbox destroyed', tenantId);

    this.logger.log(`Sandbox ${sessionId} destroyed`);
  }

  private async handleTimeoutCheck(
    data: SandboxLifecycleJobData,
  ): Promise<void> {
    const { sessionId, executionId, tenantId } = data;

    const session = await this.sandboxService.getSandboxSession(
      executionId,
      tenantId,
    );
    if (
      !session ||
      TERMINAL_SANDBOX_STATUSES.includes(
        session.status as (typeof TERMINAL_SANDBOX_STATUSES)[number],
      )
    ) {
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

      await tenantDb
        .update(schema.executionSteps)
        .set({
          status: 'failed',
          completedAt: new Date(),
          updatedAt: new Date(),
          errorMessage: { message: 'sandbox_timeout' },
        })
        .where(
          and(
            eq(schema.executionSteps.executionId, executionId),
            inArray(schema.executionSteps.status, [...ACTIVE_STEP_STATUSES]),
          ),
        );

      await tenantDb
        .update(schema.workflowExecutions)
        .set({
          status: 'failed',
          failedAt: new Date(),
          updatedAt: new Date(),
          errorMessage: { message: 'sandbox_timeout' },
        })
        .where(
          and(
            eq(schema.workflowExecutions.id, executionId),
            notInArray(schema.workflowExecutions.status, ['failed', 'completed']),
          ),
        );
    });

    await this.insertLog(sessionId, 'system', 'Sandbox timed out', tenantId);

    throw new SandboxTimeoutException(
      session!.config.timeout,
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
