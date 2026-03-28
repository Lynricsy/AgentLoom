import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, ilike, notInArray, asc, or, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import * as schema from '../../database/schema';
import type {
  SandboxConfig,
  SandboxLog,
  SandboxSession,
} from '../../database/schema';
import {
  SandboxInvalidStateException,
  SandboxNotFoundException,
  SandboxNotPersistentException,
  SandboxStatsUnavailableException,
} from './sandbox.exceptions';
import { SandboxLifecycleProducer } from './sandbox-lifecycle.producer';
import { DockerService, type ContainerStats } from './docker.service';
import type { PiConfigInput } from './pi-config-generator.service';

const TERMINAL_STATUSES = ['stopped', 'failed'] as const;
const DEFAULT_PERSISTENT_TIMEOUT = 24;

type CreateSandboxSessionParams = {
  executionId?: string;
  sandboxNodeId: string | null;
  config: SandboxConfig;
  tenantId: string;
  agentConversationId?: string;
  piConfigInput?: PiConfigInput;
};

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly lifecycleProducer: SandboxLifecycleProducer,
    private readonly dockerService: DockerService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async createSandboxSession({
    executionId,
    sandboxNodeId,
    config,
    tenantId,
    agentConversationId,
    piConfigInput,
  }: CreateSandboxSessionParams): Promise<SandboxSession> {
    const existing = await this.findActiveSession({
      executionId,
      agentConversationId,
      tenantId,
    });

    if (existing) {
      this.logger.debug(
        `Reusing existing sandbox session ${existing.id} (status=${existing.status}) for ${this.describeBinding({ executionId, agentConversationId })}`,
      );
      return existing;
    }

    this.ensureBinding({ executionId, agentConversationId });

    const [session] = await this.tenantDb
      .insert(schema.sandboxSessions)
      .values({
        ...(executionId ? { executionId } : {}),
        ...(agentConversationId ? { agentConversationId } : {}),
        sandboxNodeId,
        tenantId,
        config,
        status: 'creating',
      })
      .returning();

    await this.lifecycleProducer.addCreateTask({
      sessionId: session.id,
      tenantId,
      config,
      ...(session.executionId ? { executionId: session.executionId } : {}),
      ...(session.agentConversationId
        ? { agentConversationId: session.agentConversationId }
        : {}),
      ...(piConfigInput ? { piConfigInput } : {}),
    });

    this.logger.log(
      `Created sandbox session ${session.id} for ${this.describeBinding({ executionId: session.executionId ?? undefined, agentConversationId: session.agentConversationId ?? undefined })}`,
    );

    return session;
  }

  async findByExecutionId(
    executionId: string,
    tenantId: string,
  ): Promise<SandboxSession | null> {
    return this.findActiveSession({ executionId, tenantId });
  }

  async getSandboxSession(
    executionId: string,
    tenantId: string,
  ): Promise<SandboxSession | null> {
    return this.findByExecutionId(executionId, tenantId);
  }

  async findByConversationId(
    agentConversationId: string,
    tenantId: string,
  ): Promise<SandboxSession | null> {
    return this.findActiveSession({ agentConversationId, tenantId });
  }

  async updateSessionStatus(
    sessionId: string,
    status: SandboxSession['status'],
    metadata?: Partial<
      Pick<
        SandboxSession,
        'containerId' | 'workspacePath' | 'startedAt' | 'stoppedAt'
      >
    >,
  ): Promise<void> {
    const result = await this.tenantDb
      .update(schema.sandboxSessions)
      .set({ status, ...metadata })
      .where(eq(schema.sandboxSessions.id, sessionId))
      .returning({ id: schema.sandboxSessions.id });

    if (result.length === 0) {
      throw new SandboxNotFoundException(sessionId);
    }

    this.logger.log(`Updated sandbox session ${sessionId} status to ${status}`);
  }

  async destroySandbox(executionId: string, tenantId: string): Promise<void> {
    await this.destroyActiveSandbox(
      { executionId, tenantId },
      `execution ${executionId}`,
    );
  }

  async destroyConversationSandbox(
    agentConversationId: string,
    tenantId: string,
  ): Promise<void> {
    await this.destroyActiveSandbox(
      { agentConversationId, tenantId },
      `conversation ${agentConversationId}`,
    );
  }

  async endConversationSandbox(
    agentConversationId: string,
    tenantId: string,
    _options: { archive?: boolean } = {},
  ): Promise<void> {
    const session = await this.findActiveSession({
      agentConversationId,
      tenantId,
    });

    if (!session) {
      this.logger.warn(
        `No active sandbox session found for conversation ${agentConversationId}, skipping end`,
      );
      return;
    }

    const lifecycleMode = session.config.lifecycleMode ?? 'session';

    if (lifecycleMode === 'persistent') {
      await runInTenantTransaction(this.db, tenantId, async () => {
        const tenantDb = getTenantDb(this.db);
        await tenantDb
          .update(schema.sandboxSessions)
          .set({ agentConversationId: null })
          .where(eq(schema.sandboxSessions.id, session.id));
      });

      this.logger.log(
        `Persistent sandbox ${session.id} disconnected from conversation ${agentConversationId}`,
      );
      return;
    }

    await this.destroyConversationSandbox(agentConversationId, tenantId);
  }

  private async destroyActiveSandbox(
    params: {
      executionId?: string;
      agentConversationId?: string;
      tenantId: string;
    },
    bindingLabel: string,
  ): Promise<void> {
    const session = await this.findActiveSession(params);

    if (!session) {
      this.logger.warn(
        `No active sandbox session found for ${bindingLabel}, skipping destroy`,
      );
      return;
    }

    await this.updateSessionStatus(session.id, 'stopping');

    await this.lifecycleProducer.addDestroyTask({
      sessionId: session.id,
      tenantId: params.tenantId,
      ...(session.executionId ? { executionId: session.executionId } : {}),
      ...(session.agentConversationId
        ? { agentConversationId: session.agentConversationId }
        : {}),
      ...(session.containerId ? { containerId: session.containerId } : {}),
      ...(session.config.persistencePath
        ? { persistencePath: session.config.persistencePath }
        : {}),
    });

    this.logger.log(`Enqueued destroy for sandbox session ${session.id}`);
  }

  private async findActiveSession(params: {
    executionId?: string;
    agentConversationId?: string;
    tenantId: string;
  }): Promise<SandboxSession | null> {
    const { executionId, agentConversationId, tenantId } = params;
    this.ensureBinding({ executionId, agentConversationId });

    const [session] = await this.tenantDb
      .select()
      .from(schema.sandboxSessions)
      .where(
        this.buildActiveSessionWhere({
          executionId,
          agentConversationId,
          tenantId,
        }),
      )
      .limit(1);

    return session ?? null;
  }

  private buildActiveSessionWhere(params: {
    executionId?: string;
    agentConversationId?: string;
    tenantId: string;
  }) {
    const { executionId, agentConversationId, tenantId } = params;

    if (executionId && agentConversationId) {
      return and(
        eq(schema.sandboxSessions.executionId, executionId),
        eq(schema.sandboxSessions.agentConversationId, agentConversationId),
        eq(schema.sandboxSessions.tenantId, tenantId),
        notInArray(schema.sandboxSessions.status, [...TERMINAL_STATUSES]),
      );
    }

    if (executionId) {
      return and(
        eq(schema.sandboxSessions.executionId, executionId),
        eq(schema.sandboxSessions.tenantId, tenantId),
        notInArray(schema.sandboxSessions.status, [...TERMINAL_STATUSES]),
      );
    }

    if (agentConversationId) {
      return and(
        eq(schema.sandboxSessions.agentConversationId, agentConversationId),
        eq(schema.sandboxSessions.tenantId, tenantId),
        notInArray(schema.sandboxSessions.status, [...TERMINAL_STATUSES]),
      );
    }

    throw new Error(
      'Sandbox session requires executionId or agentConversationId',
    );
  }

  private ensureBinding(params: {
    executionId?: string;
    agentConversationId?: string;
  }): void {
    if (!params.executionId && !params.agentConversationId) {
      throw new Error(
        'Sandbox session requires executionId or agentConversationId',
      );
    }
  }

  private describeBinding(params: {
    executionId?: string;
    agentConversationId?: string;
  }): string {
    if (params.executionId && params.agentConversationId) {
      return `execution ${params.executionId} / conversation ${params.agentConversationId}`;
    }

    if (params.executionId) {
      return `execution ${params.executionId}`;
    }

    return `conversation ${params.agentConversationId}`;
  }

  async getSandboxLogs(sessionId: string): Promise<SandboxLog[]> {
    return this.tenantDb
      .select()
      .from(schema.sandboxLogs)
      .where(eq(schema.sandboxLogs.sessionId, sessionId))
      .orderBy(asc(schema.sandboxLogs.createdAt));
  }

  // -- Sandbox Management API methods --

  async listSandboxes(
    tenantId: string,
    query: {
      page: number;
      pageSize: number;
      status?: SandboxSession['status'];
      lifecycleMode?: 'session' | 'persistent';
      search?: string;
    },
  ): Promise<{
    data: SandboxSession[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const { page, pageSize, status, lifecycleMode, search } = query;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.sandboxSessions.tenantId, tenantId)];

    if (status) {
      conditions.push(eq(schema.sandboxSessions.status, status));
    }

    if (lifecycleMode) {
      conditions.push(
        sql`${schema.sandboxSessions.config}->>'lifecycleMode' = ${lifecycleMode}`,
      );
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          sql`${schema.sandboxSessions.config}->>'name' ILIKE ${pattern}`,
          ilike(schema.sandboxSessions.id, pattern),
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.sandboxSessions)
        .where(whereClause)
        .orderBy(desc(schema.sandboxSessions.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.sandboxSessions)
        .where(whereClause),
    ]);

    const total_ = total ?? 0;

    return {
      data,
      meta: {
        page,
        pageSize,
        total: total_,
        totalPages: total_ === 0 ? 0 : Math.ceil(total_ / pageSize),
      },
    };
  }

  async createPersistentSandbox(
    tenantId: string,
    params: { name: string; cpu: number; memory: number; disk: number },
  ): Promise<SandboxSession> {
    const config: SandboxConfig = {
      cpu: params.cpu,
      memory: params.memory,
      disk: params.disk,
      timeout: DEFAULT_PERSISTENT_TIMEOUT,
      lifecycleMode: 'persistent',
      name: params.name,
    };

    const [session] = await this.tenantDb
      .insert(schema.sandboxSessions)
      .values({
        tenantId,
        sandboxNodeId: null,
        config,
        status: 'creating',
      })
      .returning();

    await this.lifecycleProducer.addCreateTask({
      sessionId: session.id,
      tenantId,
      config,
    });

    this.logger.log(
      `Created persistent sandbox ${session.id} (name=${params.name})`,
    );

    return session;
  }

  async getSessionById(sessionId: string): Promise<SandboxSession> {
    const [session] = await this.tenantDb
      .select()
      .from(schema.sandboxSessions)
      .where(eq(schema.sandboxSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new SandboxNotFoundException(sessionId);
    }

    return session;
  }

  async getContainerStats(sessionId: string): Promise<ContainerStats> {
    const session = await this.getSessionById(sessionId);

    if (
      !session.containerId ||
      TERMINAL_STATUSES.includes(
        session.status as (typeof TERMINAL_STATUSES)[number],
      )
    ) {
      throw new SandboxStatsUnavailableException(sessionId);
    }

    return this.dockerService.getContainerStats(session.containerId);
  }

  async stopSandbox(
    sessionId: string,
    tenantId: string,
  ): Promise<SandboxSession> {
    const session = await this.getSessionById(sessionId);

    const stoppableStatuses = ['ready', 'busy', 'creating'];
    if (!stoppableStatuses.includes(session.status)) {
      throw new SandboxInvalidStateException(sessionId, session.status, 'stop');
    }

    await this.updateSessionStatus(sessionId, 'stopping');

    await this.lifecycleProducer.addDestroyTask({
      sessionId,
      tenantId,
      ...(session.containerId ? { containerId: session.containerId } : {}),
      ...(session.config.persistencePath
        ? { persistencePath: session.config.persistencePath }
        : {}),
    });

    this.logger.log(`Enqueued stop for sandbox ${sessionId}`);

    return this.getSessionById(sessionId);
  }

  async startSandbox(
    sessionId: string,
    tenantId: string,
  ): Promise<SandboxSession> {
    const session = await this.getSessionById(sessionId);

    if ((session.config.lifecycleMode ?? 'session') !== 'persistent') {
      throw new SandboxNotPersistentException(sessionId);
    }

    if (session.status !== 'stopped') {
      throw new SandboxInvalidStateException(
        sessionId,
        session.status,
        'start',
      );
    }

    await this.updateSessionStatus(sessionId, 'creating');

    await this.lifecycleProducer.addCreateTask({
      sessionId,
      tenantId,
      config: session.config,
    });

    this.logger.log(`Enqueued start for persistent sandbox ${sessionId}`);

    return this.getSessionById(sessionId);
  }

  async deleteSandbox(sessionId: string, tenantId: string): Promise<void> {
    const session = await this.getSessionById(sessionId);

    if ((session.config.lifecycleMode ?? 'session') !== 'persistent') {
      throw new SandboxNotPersistentException(sessionId);
    }

    // If sandbox is running, stop the container first
    if (
      session.containerId &&
      !TERMINAL_STATUSES.includes(
        session.status as (typeof TERMINAL_STATUSES)[number],
      )
    ) {
      try {
        await this.dockerService.stopContainer(session.containerId);
        await this.dockerService.removeContainer(session.containerId);
      } catch (error) {
        this.logger.warn(
          `Failed to cleanup container for sandbox ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await runInTenantTransaction(this.db, tenantId, async () => {
      const tenantDb = getTenantDb(this.db);

      // Delete associated logs first
      await tenantDb
        .delete(schema.sandboxLogs)
        .where(eq(schema.sandboxLogs.sessionId, sessionId));

      // Delete the session
      await tenantDb
        .delete(schema.sandboxSessions)
        .where(eq(schema.sandboxSessions.id, sessionId));
    });

    this.logger.log(`Deleted persistent sandbox ${sessionId}`);
  }
}
