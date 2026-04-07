import { Inject, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import * as schema from '../../database/schema';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';

import { StorageService } from '../../infrastructure/storage/storage.service';
import { SandboxService } from './sandbox.service';
import { SandboxLifecycleProducer } from './sandbox-lifecycle.producer';
import { WorkspaceService } from '../workspace/workspace.service';
import { AgentConversationService } from '../agent-conversation/agent-conversation.service';
import { AgentExecutionService } from '../agent-execution/agent-execution.service';
import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from './sandbox-runtime-driver.port';
import {
  SANDBOX_LIFECYCLE_QUEUE,
  type SandboxLifecycleJobData,
} from './sandbox.constants';
import {
  SandboxCreationException,
  SandboxTimeoutException,
} from './sandbox.exceptions';
import {
  formatSandboxTimeoutLabel,
  resolveSandboxTimeoutDelayMs,
} from './sandbox-timeout.utils';
import { resolveSandboxConversationIdleAutoEndDelayMs } from './sandbox-conversation-idle.utils';
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
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly dockerService: SandboxRuntimeDriver,
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
      case 'start':
        return this.handleStart(job.data);
      case 'stop':
        return this.handleStop(job.data);
      case 'destroy':
        return this.handleDestroy(job.data);
      case 'timeout_check':
        return this.handleTimeoutCheck(job.data);
      case 'conversation_idle_end_check':
        return this.handleConversationIdleEndCheck(job.data);
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
        {
          piConfigInput: data.piConfigInput,
          conversationId: data.agentConversationId,
        },
      );
      containerId = container.containerId;

      const [activatedSession] = await runInTenantTransaction(
        this.db,
        tenantId,
        async (tenantDb) => {
          return await tenantDb
            .update(schema.sandboxSessions)
            .set({
              containerId,
              status: 'ready',
              startedAt: new Date(),
              workspacePath: CONTAINER_WORKSPACE,
            })
            .where(
              and(
                eq(schema.sandboxSessions.id, sessionId),
                eq(schema.sandboxSessions.status, 'creating'),
              ),
            )
            .returning({ id: schema.sandboxSessions.id });
        },
      );

      if (!activatedSession) {
        await this.dockerService.stopContainer(containerId).catch((error) => {
          this.logger.warn(
            `Failed to stop sandbox container ${containerId} after session ${sessionId} left creating state: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
        await this.dockerService.removeContainer(containerId).catch((error) => {
          this.logger.warn(
            `Failed to cleanup sandbox container ${containerId} after session ${sessionId} left creating state: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
        await this.insertLog(
          sessionId,
          'system',
          `Sandbox container ${containerId} discarded because session left creating state`,
          tenantId,
        );
        this.logger.warn(
          `Sandbox ${sessionId} left creating state before container ${containerId} could be activated`,
        );
        return;
      }

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

      await this.attachContainerLogs(sessionId, containerId, tenantId);
      await this.scheduleTimeoutCheck(sessionId, tenantId, config, binding);
      await this.scheduleConversationIdleEndCheck(
        sessionId,
        tenantId,
        config,
        typeof binding.agentConversationId === 'string'
          ? [binding.agentConversationId]
          : [],
      );

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

      await runInTenantTransaction(this.db, tenantId, async (tenantDb) => {
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

  private async handleStart(data: SandboxLifecycleJobData): Promise<void> {
    const { sessionId, tenantId, config, containerId } = data;
    const binding = this.resolveBinding(data);

    if (!config) {
      throw new SandboxCreationException('Missing config in start job data');
    }

    if (!containerId) {
      throw new SandboxCreationException(
        'Missing containerId in start job data',
      );
    }

    try {
      await this.dockerService.startContainer(containerId);

      const [activatedSession] = await runInTenantTransaction(
        this.db,
        tenantId,
        async (tenantDb) => {
          return await tenantDb
            .update(schema.sandboxSessions)
            .set({
              status: 'ready',
              startedAt: new Date(),
              stoppedAt: null,
              workspacePath: CONTAINER_WORKSPACE,
            })
            .where(
              and(
                eq(schema.sandboxSessions.id, sessionId),
                eq(schema.sandboxSessions.status, 'creating'),
              ),
            )
            .returning({ id: schema.sandboxSessions.id });
        },
      );

      if (!activatedSession) {
        await this.dockerService.stopContainer(containerId).catch((error) => {
          this.logger.warn(
            `Failed to re-stop sandbox container ${containerId} after session ${sessionId} left creating state: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
        await this.insertLog(
          sessionId,
          'system',
          `Sandbox container ${containerId} re-stopped because session left creating state during restart`,
          tenantId,
        );
        this.logger.warn(
          `Sandbox ${sessionId} left creating state before container ${containerId} could be restarted`,
        );
        return;
      }

      await this.insertLog(
        sessionId,
        'system',
        `Sandbox container ${containerId} started`,
        tenantId,
      );

      await this.attachContainerLogs(sessionId, containerId, tenantId);
      await this.scheduleTimeoutCheck(sessionId, tenantId, config, binding);
      await this.scheduleConversationIdleEndCheck(
        sessionId,
        tenantId,
        config,
        typeof binding.agentConversationId === 'string'
          ? [binding.agentConversationId]
          : [],
      );

      this.logger.log(
        `Sandbox ${sessionId} restarted with container ${containerId}`,
      );
    } catch (error) {
      await runInTenantTransaction(this.db, tenantId, async (tenantDb) => {
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
        `Sandbox start failed: ${error instanceof Error ? error.message : String(error)}`,
        tenantId,
      );

      throw error;
    }
  }

  private async handleStop(data: SandboxLifecycleJobData): Promise<void> {
    const { sessionId, containerId, tenantId, persistencePath, config } = data;
    const binding = this.resolveBinding(data);

    await this.lifecycleProducer.removeTimeoutCheckTask(sessionId);
    await this.lifecycleProducer.removeConversationIdleEndCheckTask(sessionId);

    if (containerId) {
      await this.syncRestoredWorkspaceSnapshot({
        sessionId,
        tenantId,
        containerId,
        restoreWorkspaceId: this.readRestoreWorkspaceId(config),
        phaseLabel: 'stop',
      });

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
            `Workspace synced to MinIO before stopping session ${sessionId}: ${storageKey}`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to sync workspace before stopping session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      await this.dockerService.stopContainer(containerId);
    }

    await runInTenantTransaction(this.db, tenantId, async (tenantDb) => {
      await tenantDb
        .update(schema.sandboxSessions)
        .set({ status: 'stopped', stoppedAt: new Date() })
        .where(eq(schema.sandboxSessions.id, sessionId));
    });

    await this.insertLog(sessionId, 'system', 'Sandbox stopped', tenantId);
    this.logger.log(`Sandbox ${sessionId} stopped`);
  }

  private async handleDestroy(data: SandboxLifecycleJobData): Promise<void> {
    const { sessionId, containerId, tenantId, persistencePath } = data;
    const binding = this.resolveBinding(data);
    const [session] = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tenantDb) => {
        return await tenantDb
          .select({ config: schema.sandboxSessions.config })
          .from(schema.sandboxSessions)
          .where(eq(schema.sandboxSessions.id, sessionId))
          .limit(1);
      },
    );

    await this.lifecycleProducer.removeTimeoutCheckTask(sessionId);
    await this.lifecycleProducer.removeConversationIdleEndCheckTask(sessionId);

    if (containerId) {
      await this.syncRestoredWorkspaceSnapshot({
        sessionId,
        tenantId,
        containerId,
        restoreWorkspaceId: this.readRestoreWorkspaceId(session?.config),
        phaseLabel: 'destroy',
      });

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

    const purged = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tenantDb) => {
        const isSessionMode =
          (session?.config.lifecycleMode ?? 'session') === 'session';

        if (isSessionMode) {
          // Session-mode: hard-delete row (FK cascade removes logs)
          await tenantDb
            .delete(schema.sandboxSessions)
            .where(eq(schema.sandboxSessions.id, sessionId));
          return true;
        }

        await tenantDb
          .update(schema.sandboxSessions)
          .set({ status: 'stopped', stoppedAt: new Date() })
          .where(eq(schema.sandboxSessions.id, sessionId));
        return false;
      },
    );

    if (!purged) {
      await this.insertLog(sessionId, 'system', 'Sandbox destroyed', tenantId);
    }

    this.logger.log(
      purged
        ? `Sandbox ${sessionId} destroyed and purged (session-mode)`
        : `Sandbox ${sessionId} destroyed`,
    );
  }

  private async handleTimeoutCheck(
    data: SandboxLifecycleJobData,
  ): Promise<void> {
    const { sessionId, tenantId } = data;
    await this.lifecycleProducer.removeConversationIdleEndCheckTask(sessionId);
    const session = await this.sandboxService
      .getSessionById(sessionId)
      .catch(() => null);

    if (
      !session ||
      TERMINAL_SANDBOX_STATUSES.includes(
        session.status as (typeof TERMINAL_SANDBOX_STATUSES)[number],
      )
    ) {
      return;
    }

    const binding = {
      executionId: session.executionId ?? undefined,
      agentConversationId: session.agentConversationId ?? undefined,
      sandboxNodeId: session.sandboxNodeId ?? undefined,
    };
    const isSessionMode =
      (session.config.lifecycleMode ?? 'session') === 'session';

    this.logger.warn(`Sandbox ${sessionId} timed out, force stopping`);

    if (session.containerId) {
      await this.syncRestoredWorkspaceSnapshot({
        sessionId,
        tenantId,
        containerId: session.containerId,
        restoreWorkspaceId: this.readRestoreWorkspaceId(session.config),
        phaseLabel: 'timeout',
      });

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
      if (isSessionMode) {
        await this.dockerService.removeContainer(session.containerId);
      }
    }

    await runInTenantTransaction(this.db, tenantId, async (tenantDb) => {
      if (isSessionMode) {
        // Session-mode: hard-delete row (FK cascade removes logs)
        await tenantDb
          .delete(schema.sandboxSessions)
          .where(eq(schema.sandboxSessions.id, sessionId));
      } else {
        await tenantDb
          .update(schema.sandboxSessions)
          .set({
            status: 'stopped',
            stoppedAt: new Date(),
          })
          .where(eq(schema.sandboxSessions.id, sessionId));
      }

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

    if (!isSessionMode) {
      await this.insertLog(
        sessionId,
        'system',
        'Sandbox auto-stopped after timeout',
        tenantId,
      );
    }

    if (binding.executionId) {
      throw new SandboxTimeoutException(
        formatSandboxTimeoutLabel(session.config),
      );
    }
  }

  private async handleConversationIdleEndCheck(
    data: SandboxLifecycleJobData,
  ): Promise<void> {
    const { sessionId, tenantId } = data;
    const session = await this.sandboxService
      .getSessionById(sessionId)
      .catch(() => null);

    if (
      !session ||
      session.status === 'stopping' ||
      TERMINAL_SANDBOX_STATUSES.includes(
        session.status as (typeof TERMINAL_SANDBOX_STATUSES)[number],
      )
    ) {
      return;
    }

    const conversationIds = this.getBoundConversationIds(session);
    if (conversationIds.length === 0) {
      return;
    }

    const [activeConversations, latestUserMessageIdByConversation] =
      await runInTenantTransaction(this.db, tenantId, async (tenantDb) => {
        const conversations = await tenantDb
          .select({
            id: schema.agentConversations.id,
            status: schema.agentConversations.status,
            metadata: schema.agentConversations.metadata,
          })
          .from(schema.agentConversations)
          .where(inArray(schema.agentConversations.id, conversationIds));

        const activeConversationRows = conversations.filter(
          (conversation) => conversation.status === 'active',
        );

        if (activeConversationRows.length === 0) {
          return [[], new Map<string, string>()] as const;
        }

        const userMessages = await tenantDb
          .select({
            conversationId: schema.agentMessages.conversationId,
            id: schema.agentMessages.id,
            createdAt: schema.agentMessages.createdAt,
          })
          .from(schema.agentMessages)
          .where(
            and(
              inArray(
                schema.agentMessages.conversationId,
                activeConversationRows.map((conversation) => conversation.id),
              ),
              eq(schema.agentMessages.role, 'user'),
            ),
          )
          .orderBy(
            asc(schema.agentMessages.createdAt),
            asc(schema.agentMessages.id),
          );

        const latestUserMessageIds = new Map<string, string>();
        for (const message of userMessages) {
          latestUserMessageIds.set(message.conversationId, message.id);
        }

        return [activeConversationRows, latestUserMessageIds] as const;
      });

    if (activeConversations.length === 0) {
      return;
    }

    const executionService = this.getAgentExecutionService();
    const allConversationsIdle = activeConversations.every((conversation) =>
      this.isConversationIdleForAutoEnd(
        conversation,
        latestUserMessageIdByConversation.get(conversation.id),
        executionService,
      ),
    );

    if (!allConversationsIdle) {
      return;
    }

    const conversationService = this.getAgentConversationService();
    if (!conversationService) {
      throw new Error('AgentConversationService is unavailable');
    }

    for (const conversation of activeConversations) {
      await runInTenantTransaction(this.db, tenantId, async () => {
        await conversationService.end(conversation.id);
      });
    }
  }

  private async insertLog(
    sessionId: string,
    level: string,
    message: string,
    tenantId: string,
  ): Promise<void> {
    await runInTenantTransaction(this.db, tenantId, async (tenantDb) => {
      await tenantDb.insert(schema.sandboxLogs).values({
        sessionId,
        level,
        message,
      });
    });
  }

  private async attachContainerLogs(
    sessionId: string,
    containerId: string,
    tenantId: string,
  ): Promise<void> {
    await this.dockerService.attachLogs(containerId, (level, message) => {
      this.insertLog(sessionId, level, message, tenantId).catch((err) => {
        this.logger.error(`Failed to insert log for session ${sessionId}`, err);
      });
    });
  }

  private async scheduleTimeoutCheck(
    sessionId: string,
    tenantId: string,
    config: NonNullable<SandboxLifecycleJobData['config']>,
    binding: {
      executionId?: string;
      agentConversationId?: string;
      sandboxNodeId?: string;
    },
  ): Promise<void> {
    const delayMs = resolveSandboxTimeoutDelayMs(config);

    await this.lifecycleProducer.removeTimeoutCheckTask(sessionId);
    await this.lifecycleProducer.addTimeoutCheckTask({
      sessionId,
      tenantId,
      delayMs,
      ...binding,
    });
  }

  private async scheduleConversationIdleEndCheck(
    sessionId: string,
    tenantId: string,
    config: Pick<SandboxLifecycleJobData, 'config'>['config'],
    conversationIds: string[] = [],
  ): Promise<void> {
    if (!config) {
      return;
    }

    if (conversationIds.length === 0) {
      return;
    }

    await this.lifecycleProducer.addConversationIdleEndCheckTask({
      sessionId,
      tenantId,
      delayMs: resolveSandboxConversationIdleAutoEndDelayMs(config),
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
    sandboxNodeId?: string;
  } {
    return {
      ...(data.executionId ? { executionId: data.executionId } : {}),
      ...(data.agentConversationId
        ? { agentConversationId: data.agentConversationId }
        : {}),
      ...(data.sandboxNodeId ? { sandboxNodeId: data.sandboxNodeId } : {}),
    };
  }

  private getBindingId(binding: {
    executionId?: string;
    agentConversationId?: string;
    sandboxNodeId?: string;
  }): string {
    if (binding.executionId) {
      return binding.sandboxNodeId
        ? `${binding.executionId}/${binding.sandboxNodeId}`
        : binding.executionId;
    }

    if (binding.agentConversationId) {
      return binding.agentConversationId;
    }

    return 'standalone';
  }

  private getBoundConversationIds(
    session: Pick<
      schema.SandboxSession,
      'agentConversationId' | 'config' | 'executionId' | 'sandboxNodeId'
    >,
  ): string[] {
    const conversationIds = new Set<string>();

    if (typeof session.agentConversationId === 'string') {
      conversationIds.add(session.agentConversationId);
    }

    const activeBindings = Array.isArray(session.config.activeBindings)
      ? session.config.activeBindings
      : [];
    for (const binding of activeBindings) {
      if (typeof binding?.agentConversationId === 'string') {
        conversationIds.add(binding.agentConversationId);
      }
    }

    return [...conversationIds];
  }

  private isConversationIdleForAutoEnd(
    conversation: {
      id: string;
      metadata: Record<string, unknown>;
    },
    latestUserMessageId: string | undefined,
    executionService: AgentExecutionService | null,
  ): boolean {
    const executionMetadata = this.readConversationExecutionMetadata(
      conversation.metadata,
    );

    if (
      executionService?.getActiveRun(conversation.id) &&
      !executionService.getActiveRun(conversation.id)?.abort.signal.aborted
    ) {
      return false;
    }

    if (executionMetadata.runningState === 'running') {
      return false;
    }

    if (
      typeof latestUserMessageId === 'string' &&
      executionMetadata.lastProcessedMessageId !== latestUserMessageId
    ) {
      return false;
    }

    return true;
  }

  private readConversationExecutionMetadata(
    metadata: Record<string, unknown>,
  ): {
    lastProcessedMessageId?: string;
    runningState?: 'idle' | 'running' | 'failed' | 'cancelled';
  } {
    const execution =
      metadata['execution'] &&
      typeof metadata['execution'] === 'object' &&
      !Array.isArray(metadata['execution'])
        ? (metadata['execution'] as Record<string, unknown>)
        : null;

    if (!execution) {
      return {};
    }

    return {
      ...(typeof execution.lastProcessedMessageId === 'string'
        ? { lastProcessedMessageId: execution.lastProcessedMessageId }
        : {}),
      ...(typeof execution.runningState === 'string'
        ? {
            runningState: execution.runningState as
              | 'idle'
              | 'running'
              | 'failed'
              | 'cancelled',
          }
        : {}),
    };
  }

  private getAgentExecutionService(): AgentExecutionService | null {
    try {
      return this.moduleRef.get(AgentExecutionService, { strict: false });
    } catch {
      return null;
    }
  }

  private getAgentConversationService(): AgentConversationService | null {
    try {
      return this.moduleRef.get(AgentConversationService, { strict: false });
    } catch {
      return null;
    }
  }

  private getWorkspaceService(): WorkspaceService | null {
    try {
      return this.moduleRef.get(WorkspaceService, { strict: false });
    } catch {
      return null;
    }
  }

  private readRestoreWorkspaceId(config: unknown): string | undefined {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return undefined;
    }

    const restoreWorkspaceId = (config as Record<string, unknown>)[
      'restoreWorkspaceId'
    ];
    return typeof restoreWorkspaceId === 'string' &&
      restoreWorkspaceId.trim().length > 0
      ? restoreWorkspaceId.trim()
      : undefined;
  }

  private async syncRestoredWorkspaceSnapshot(params: {
    sessionId: string;
    tenantId: string;
    containerId: string;
    restoreWorkspaceId?: string;
    phaseLabel: 'stop' | 'destroy' | 'timeout';
  }): Promise<void> {
    const { sessionId, tenantId, containerId, restoreWorkspaceId, phaseLabel } =
      params;

    if (!restoreWorkspaceId) {
      return;
    }

    const workspaceService = this.getWorkspaceService();
    if (!workspaceService) {
      this.logger.warn(
        `WorkspaceService unavailable, skipping restored workspace sync for session ${sessionId}`,
      );
      return;
    }

    try {
      await workspaceService.syncFromSandboxContainer(
        restoreWorkspaceId,
        containerId,
        tenantId,
      );
      this.logger.log(
        `Restored workspace ${restoreWorkspaceId} synced before ${phaseLabel} for session ${sessionId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to sync restored workspace ${restoreWorkspaceId} before ${phaseLabel} for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SandboxLifecycleJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} (${job.data.jobType}) failed for session ${job.data.sessionId}: ${error.message}`,
      error.stack,
    );
  }
}
