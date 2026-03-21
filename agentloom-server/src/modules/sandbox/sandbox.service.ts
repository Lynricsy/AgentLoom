import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, notInArray, asc } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import * as schema from '../../database/schema';
import type {
  SandboxConfig,
  SandboxLog,
  SandboxSession,
} from '../../database/schema';
import { SandboxNotFoundException } from './sandbox.exceptions';
import { SandboxLifecycleProducer } from './sandbox-lifecycle.producer';

const TERMINAL_STATUSES = ['stopped', 'failed'] as const;

type CreateSandboxSessionParams = {
  executionId?: string;
  sandboxNodeId: string | null;
  config: SandboxConfig;
  tenantId: string;
  agentConversationId?: string;
};

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly lifecycleProducer: SandboxLifecycleProducer,
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
        this.buildActiveSessionWhere({ executionId, agentConversationId, tenantId }),
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
}
