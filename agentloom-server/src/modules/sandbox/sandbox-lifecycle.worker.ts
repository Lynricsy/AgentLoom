import { Inject, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
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
import { WorkspaceService } from '../workspace/workspace.service';
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
    private readonly moduleRef: ModuleRef,
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
    const { sessionId, tenantId, config } = data;
    const binding = this.resolveBinding(data);

    if (!config) {
      throw new SandboxCreationException('Missing config in create job data');
    }

    let containerId: string | undefined;

    try {
      const container = await this.dockerService.createContainer(
        sessionId,
        config,
      );
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

      if (config.restoreWorkspaceId && containerId) {
        try {
          const workspaceService = this.moduleRef.get(WorkspaceService, {
            strict: false,
          });
          await workspaceService.restoreToSandbox(
            config.restoreWorkspaceId,
            containerId,
            tenantId,
          );
          this.logger.log(
            `Restored workspace ${config.restoreWorkspaceId} to sandbox ${sessionId}`,
          );
        } catch (restoreError) {
          this.logger.warn(
            `Failed to restore workspace ${config.restoreWorkspaceId} to sandbox ${sessionId}: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
          );
          // 恢复失败不阻塞沙箱创建，容器仍然可用（只是没有预加载的工作区）
        }
      }

      await this.insertLog(
        sessionId,
        'system',
        `Sandbox container ${containerId} created`,
        tenantId,
      );

      await this.dockerService.attachLogs(containerId, (level, message) => {
        this.insertLog(sessionId, level, message, tenantId).catch((err) => {
          this.logger.error(
            `Failed to insert log for session ${sessionId}`,
            err,
          );
        });
      });

      const delayMs = config.timeout * HOURS_TO_MS;
      await this.lifecycleProducer.addTimeoutCheckTask({
        sessionId,
        tenantId,
        delayMs,
        ...binding,
      });

      this.logger.log(
        `Sandbox ${sessionId} created with container ${containerId}`,
      );
    } catch (error) {
      if (containerId) {
        await this.dockerService
          .removeContainer(containerId)
          .catch((cleanupError) => {
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
    const binding = this.resolveBinding(data);

    if (containerId) {
      if (persistencePath) {
        try {
          const archiveStream = await this.dockerService.getArchive(
            containerId,
            CONTAINER_WORKSPACE,
          );
          const bindingId = this.getBindingId(binding);
          const storageKey = this.resolvePersistenceStorageKey(
            tenantId,
            bindingId,
            persistencePath,
          );
          await this.storageService.upload(
            storageKey,
            archiveStream,
            undefined,
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
    const { sessionId, tenantId } = data;
    const binding = this.resolveBinding(data);

    const session = await this.findActiveSessionForBinding(binding, tenantId);
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
      if (session.config.persistencePath) {
        try {
          const archiveStream = await this.dockerService.getArchive(
            session.containerId,
            CONTAINER_WORKSPACE,
          );
          const bindingId = this.getBindingId(binding);
          const storageKey = this.resolvePersistenceStorageKey(
            tenantId,
            bindingId,
            session.config.persistencePath,
          );
          await this.storageService.upload(
            storageKey,
            archiveStream,
            undefined,
            'application/x-tar',
          );
          this.logger.log(
            `Workspace archived before timeout for session ${sessionId}: ${storageKey}`,
          );
        } catch (archiveError) {
          this.logger.warn(
            `Failed to archive workspace before timeout for session ${sessionId}: ${archiveError instanceof Error ? archiveError.message : String(archiveError)}`,
          );
        }
      }

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

      if (binding.executionId) {
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
              eq(schema.executionSteps.executionId, binding.executionId),
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
              eq(schema.workflowExecutions.id, binding.executionId),
              notInArray(schema.workflowExecutions.status, [
                'failed',
                'completed',
              ]),
            ),
          );
      }
    });

    await this.insertLog(sessionId, 'system', 'Sandbox timed out', tenantId);

    if (binding.executionId) {
      throw new SandboxTimeoutException(session.config.timeout);
    }
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

  private resolvePersistenceStorageKey(
    tenantId: string,
    bindingId: string,
    persistencePath: string,
  ): string {
    const normalizedSegments = persistencePath
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment && segment !== '.' && segment !== '..');

    const normalizedPath = normalizedSegments.join('/');
    const tenantScopedPath = normalizedPath.startsWith(`tenants/${tenantId}/`)
      ? normalizedPath
      : normalizedPath
      ? `tenants/${tenantId}/${normalizedPath}`
        : `tenants/${tenantId}/sandboxes/${bindingId}`;

    return tenantScopedPath.endsWith('.tar')
      ? tenantScopedPath
      : `${tenantScopedPath}/workspace.tar`;
  }

  private resolveBinding(data: SandboxLifecycleJobData): {
    executionId?: string;
    agentConversationId?: string;
  } {
    if (data.executionId || data.agentConversationId) {
      return {
        ...(data.executionId ? { executionId: data.executionId } : {}),
        ...(data.agentConversationId
          ? { agentConversationId: data.agentConversationId }
          : {}),
      };
    }

    throw new SandboxCreationException(
      'Missing executionId and agentConversationId in sandbox lifecycle job data',
    );
  }

  private getBindingId(binding: {
    executionId?: string;
    agentConversationId?: string;
  }): string {
    if (binding.executionId) {
      return binding.executionId;
    }

    if (binding.agentConversationId) {
      return binding.agentConversationId;
    }

    throw new SandboxCreationException(
      'Missing executionId and agentConversationId in sandbox lifecycle binding',
    );
  }

  private findActiveSessionForBinding(
    binding: { executionId?: string; agentConversationId?: string },
    tenantId: string,
  ) {
    if (binding.executionId) {
      return this.sandboxService.getSandboxSession(binding.executionId, tenantId);
    }

    if (binding.agentConversationId) {
      return this.sandboxService.findByConversationId(
        binding.agentConversationId,
        tenantId,
      );
    }

    throw new SandboxCreationException(
      'Missing executionId and agentConversationId in sandbox lifecycle binding',
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SandboxLifecycleJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.data.jobType}) failed for session ${job.data.sessionId}: ${error.message}`,
      error.stack,
    );
  }
}
