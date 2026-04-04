import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, desc, eq, notInArray, asc, or, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
  runInTenantTransaction,
} from '../../common/interceptors/tenant-transaction.context';
import * as schema from '../../database/schema';
import type {
  SandboxBindingRef,
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
import type { PiConfigInput } from './pi-config-generator.service';
import {
  SANDBOX_RUNTIME_DRIVER,
  type ContainerStats,
  type SandboxRuntimeDriver,
} from './sandbox-runtime-driver.port';
import {
  resolveSandboxConversationIdleAutoEndDelayMs,
  resolveSandboxConversationIdleAutoEndMinutes,
} from './sandbox-conversation-idle.utils';

const TERMINAL_STATUSES = ['stopped', 'failed'] as const;
const NON_ACTIVE_SESSION_STATUSES = ['stopping', ...TERMINAL_STATUSES] as const;
const DEFAULT_PERSISTENT_TIMEOUT = 24;
const GB_TO_BYTES = 1024 * 1024 * 1024;

type CreateSandboxSessionParams = {
  executionId?: string;
  sandboxNodeId: string | null;
  config: SandboxConfig;
  tenantId: string;
  agentConversationId?: string;
  piConfigInput?: PiConfigInput;
};

type ActiveSandboxLookupParams = {
  executionId?: string;
  agentConversationId?: string;
  sandboxNodeId?: string | null;
  tenantId: string;
};

export type SandboxBindingType = 'conversation' | 'execution' | 'resource';

export type SandboxListItem = SandboxSession & {
  bindingType: SandboxBindingType;
};

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly lifecycleProducer: SandboxLifecycleProducer,
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly dockerService: SandboxRuntimeDriver,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  @OnEvent('agent-conversation.message-sent')
  async handleConversationMessageSent(payload: {
    conversationId: string;
    tenantId: string;
  }): Promise<void> {
    await this.cancelConversationIdleAutoEnd(
      payload.conversationId,
      payload.tenantId,
    );
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
      sandboxNodeId,
      tenantId,
    });

    if (existing) {
      this.logger.debug(
        `Reusing existing sandbox session ${existing.id} (status=${existing.status}) for ${this.describeBinding({ executionId, agentConversationId, sandboxNodeId: sandboxNodeId ?? undefined })}`,
      );
      return existing;
    }

    this.ensureBinding({ executionId, agentConversationId });

    if (
      config.lifecycleMode === 'persistent' &&
      typeof config.persistentSandboxId === 'string' &&
      config.persistentSandboxId.trim().length > 0
    ) {
      return this.attachPersistentSandbox({
        executionId,
        agentConversationId,
        sandboxNodeId,
        persistentSandboxId: config.persistentSandboxId.trim(),
        tenantId,
      });
    }

    const session = await this.createSandboxSessionRecord({
      executionId,
      agentConversationId,
      sandboxNodeId,
      tenantId,
      config,
    });

    await this.lifecycleProducer.addCreateTask({
      sessionId: session.id,
      tenantId,
      config,
      ...(session.executionId ? { executionId: session.executionId } : {}),
      ...(session.agentConversationId
        ? { agentConversationId: session.agentConversationId }
        : {}),
      ...(session.sandboxNodeId
        ? { sandboxNodeId: session.sandboxNodeId }
        : {}),
      ...(piConfigInput ? { piConfigInput } : {}),
    });

    this.logger.log(
      `Created sandbox session ${session.id} for ${this.describeBinding({ executionId: session.executionId ?? undefined, agentConversationId: session.agentConversationId ?? undefined, sandboxNodeId: session.sandboxNodeId ?? undefined })}`,
    );

    return session;
  }

  async findByExecutionId(
    executionId: string,
    tenantId: string,
    sandboxNodeId?: string | null,
  ): Promise<SandboxSession | null> {
    return this.findActiveSession({ executionId, tenantId, sandboxNodeId });
  }

  async getSandboxSession(
    executionId: string,
    tenantId: string,
    sandboxNodeId?: string | null,
  ): Promise<SandboxSession | null> {
    return this.findByExecutionId(executionId, tenantId, sandboxNodeId);
  }

  async findByConversationId(
    agentConversationId: string,
    tenantId: string,
  ): Promise<SandboxSession | null> {
    return this.findActiveSession({ agentConversationId, tenantId });
  }

  async getConversationSandboxStats(
    agentConversationId: string,
    tenantId: string,
  ): Promise<ContainerStats> {
    const session = await this.findByConversationId(
      agentConversationId,
      tenantId,
    );

    if (!session) {
      throw new SandboxStatsUnavailableException(agentConversationId);
    }

    return this.buildContainerStats(session);
  }

  async scheduleConversationIdleAutoEnd(
    agentConversationId: string,
    tenantId: string,
  ): Promise<void> {
    const session = await this.findActiveSession({
      agentConversationId,
      tenantId,
    });

    if (!session) {
      return;
    }

    const conversationIds = this.getBoundConversationIds(session);
    if (conversationIds.length === 0) {
      return;
    }

    const delayMs = resolveSandboxConversationIdleAutoEndDelayMs(
      session.config,
    );

    await this.enqueueLifecycleTask(async () => {
      await this.lifecycleProducer.addConversationIdleEndCheckTask({
        sessionId: session.id,
        tenantId,
        delayMs,
      });
    });
  }

  async cancelConversationIdleAutoEnd(
    agentConversationId: string,
    tenantId: string,
  ): Promise<void> {
    const session = await this.findActiveSession({
      agentConversationId,
      tenantId,
    });

    if (!session) {
      return;
    }

    await this.enqueueLifecycleTask(async () => {
      await this.lifecycleProducer.removeConversationIdleEndCheckTask(
        session.id,
      );
    });
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

  private async markSessionStopping(sessionId: string): Promise<boolean> {
    const result = await this.tenantDb
      .update(schema.sandboxSessions)
      .set({ status: 'stopping' })
      .where(
        and(
          eq(schema.sandboxSessions.id, sessionId),
          notInArray(schema.sandboxSessions.status, [
            ...NON_ACTIVE_SESSION_STATUSES,
          ]),
        ),
      )
      .returning({ id: schema.sandboxSessions.id });

    if (result.length === 0) {
      return false;
    }

    this.logger.log(`Updated sandbox session ${sessionId} status to stopping`);
    return true;
  }

  async destroySandbox(executionId: string, tenantId: string): Promise<void> {
    const sessions = await this.findActiveSessions({
      executionId,
      tenantId,
    });

    if (sessions.length === 0) {
      this.logger.warn(
        `No active sandbox sessions found for execution ${executionId}, skipping destroy`,
      );
      return;
    }

    for (const session of sessions) {
      await this.cleanupExecutionSession(session, tenantId);
    }
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
      await this.detachPersistentSession(session, tenantId, {
        agentConversationId,
      });
      return;
    }

    await this.destroyConversationSandbox(agentConversationId, tenantId);
  }

  async releaseExecutionSandbox(
    executionId: string,
    sandboxNodeId: string,
    tenantId: string,
  ): Promise<void> {
    const session = await this.findActiveSession({
      executionId,
      sandboxNodeId,
      tenantId,
    });

    if (!session) {
      this.logger.warn(
        `No active sandbox session found for execution ${executionId} / sandbox ${sandboxNodeId}, skipping release`,
      );
      return;
    }

    const lifecycleMode = session.config.lifecycleMode ?? 'session';

    if (lifecycleMode === 'persistent') {
      await this.detachPersistentSession(session, tenantId, {
        executionId,
        sandboxNodeId,
      });
      return;
    }

    await this.cleanupExecutionSession(session, tenantId);
  }

  private async destroyActiveSandbox(
    params: {
      executionId?: string;
      agentConversationId?: string;
      sandboxNodeId?: string | null;
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

    const markedStopping = await this.markSessionStopping(session.id);
    if (!markedStopping) {
      this.logger.debug(
        `Sandbox session ${session.id} already stopping or stopped, skipping duplicate destroy enqueue`,
      );
      return;
    }

    await this.enqueueLifecycleTask(async () => {
      await this.lifecycleProducer.removeConversationIdleEndCheckTask(
        session.id,
      );
      await this.lifecycleProducer.addDestroyTask({
        sessionId: session.id,
        tenantId: params.tenantId,
        ...(session.executionId ? { executionId: session.executionId } : {}),
        ...(session.agentConversationId
          ? { agentConversationId: session.agentConversationId }
          : {}),
        ...(session.sandboxNodeId
          ? { sandboxNodeId: session.sandboxNodeId }
          : {}),
        ...(session.containerId ? { containerId: session.containerId } : {}),
        ...(session.config.persistencePath
          ? { persistencePath: session.config.persistencePath }
          : {}),
      });
    });

    this.logger.log(`Enqueued destroy for sandbox session ${session.id}`);
  }

  private async enqueueLifecycleTask(task: () => Promise<void>): Promise<void> {
    if (hasActiveTenantTransaction()) {
      registerAfterCommitHook(task);
      return;
    }

    await task();
  }

  private async createSandboxSessionRecord(params: {
    executionId?: string;
    agentConversationId?: string;
    sandboxNodeId: string | null;
    tenantId: string;
    config: SandboxConfig;
  }): Promise<SandboxSession> {
    const values = {
      ...(params.executionId ? { executionId: params.executionId } : {}),
      ...(params.agentConversationId
        ? { agentConversationId: params.agentConversationId }
        : {}),
      sandboxNodeId: params.sandboxNodeId,
      tenantId: params.tenantId,
      config: params.config,
      status: 'creating' as const,
    };

    if (!hasActiveTenantTransaction()) {
      const [session] = await this.tenantDb
        .insert(schema.sandboxSessions)
        .values(values)
        .returning();

      return session;
    }

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE authenticated`);
      await tx.execute(
        sql`SELECT set_config('app.current_tenant', ${params.tenantId}, true)`,
      );

      const tenantDb = tx as unknown as DrizzleDB;
      const [session] = await tenantDb
        .insert(schema.sandboxSessions)
        .values(values)
        .returning();

      return session;
    });
  }

  private async findActiveSession(
    params: ActiveSandboxLookupParams,
  ): Promise<SandboxSession | null> {
    const { executionId, agentConversationId, tenantId, sandboxNodeId } =
      params;
    this.ensureBinding({ executionId, agentConversationId });

    const [session] = await this.tenantDb
      .select()
      .from(schema.sandboxSessions)
      .where(
        this.buildActiveSessionWhere({
          executionId,
          agentConversationId,
          sandboxNodeId,
          tenantId,
        }),
      )
      .limit(1);

    if (session) {
      return session;
    }

    if (typeof sandboxNodeId !== 'string') {
      return null;
    }

    return this.findPersistentSessionByBinding({
      executionId,
      agentConversationId,
      sandboxNodeId,
      tenantId,
    });
  }

  private async findActiveSessions(
    params: ActiveSandboxLookupParams,
  ): Promise<SandboxSession[]> {
    const { executionId, agentConversationId, tenantId, sandboxNodeId } =
      params;
    this.ensureBinding({ executionId, agentConversationId });

    const sessions = await this.tenantDb
      .select()
      .from(schema.sandboxSessions)
      .where(
        this.buildActiveSessionWhere({
          executionId,
          agentConversationId,
          sandboxNodeId,
          tenantId,
        }),
      );

    if (sessions.length > 0 || typeof sandboxNodeId !== 'string') {
      return sessions;
    }

    const persistentSession = await this.findPersistentSessionByBinding({
      executionId,
      agentConversationId,
      sandboxNodeId,
      tenantId,
    });

    return persistentSession ? [persistentSession] : [];
  }

  private buildActiveSessionWhere(params: ActiveSandboxLookupParams) {
    const { executionId, agentConversationId, tenantId, sandboxNodeId } =
      params;
    const sandboxNodeCondition =
      typeof sandboxNodeId === 'string'
        ? eq(schema.sandboxSessions.sandboxNodeId, sandboxNodeId)
        : undefined;

    if (executionId && agentConversationId) {
      return and(
        eq(schema.sandboxSessions.executionId, executionId),
        eq(schema.sandboxSessions.agentConversationId, agentConversationId),
        ...(sandboxNodeCondition ? [sandboxNodeCondition] : []),
        eq(schema.sandboxSessions.tenantId, tenantId),
        notInArray(schema.sandboxSessions.status, [
          ...NON_ACTIVE_SESSION_STATUSES,
        ]),
      );
    }

    if (executionId) {
      return and(
        eq(schema.sandboxSessions.executionId, executionId),
        ...(sandboxNodeCondition ? [sandboxNodeCondition] : []),
        eq(schema.sandboxSessions.tenantId, tenantId),
        notInArray(schema.sandboxSessions.status, [
          ...NON_ACTIVE_SESSION_STATUSES,
        ]),
      );
    }

    if (agentConversationId) {
      return and(
        eq(schema.sandboxSessions.agentConversationId, agentConversationId),
        eq(schema.sandboxSessions.tenantId, tenantId),
        notInArray(schema.sandboxSessions.status, [
          ...NON_ACTIVE_SESSION_STATUSES,
        ]),
      );
    }

    throw new Error(
      'Sandbox session requires executionId or agentConversationId',
    );
  }

  private async findPersistentSessionByBinding(
    params: ActiveSandboxLookupParams,
  ): Promise<SandboxSession | null> {
    const targetBinding = this.normalizeBinding({
      executionId: params.executionId,
      agentConversationId: params.agentConversationId,
      sandboxNodeId: params.sandboxNodeId,
    });

    if (
      !this.hasBindingIdentity(targetBinding) ||
      typeof targetBinding.sandboxNodeId !== 'string'
    ) {
      return null;
    }

    const candidates = await this.tenantDb
      .select()
      .from(schema.sandboxSessions)
      .where(
        and(
          this.buildActiveSessionWhere({
            ...params,
            sandboxNodeId: undefined,
          }),
          sql`${schema.sandboxSessions.config}->>'lifecycleMode' = 'persistent'`,
        ),
      )
      .limit(20);

    return (
      candidates.find((candidate) =>
        this.getPersistentBindings(candidate).some((binding) =>
          this.bindingsEqual(binding, targetBinding),
        ),
      ) ?? null
    );
  }

  private normalizeBinding(binding: {
    executionId?: string | null;
    agentConversationId?: string | null;
    sandboxNodeId?: string | null;
  }): SandboxBindingRef {
    return {
      ...(typeof binding.executionId === 'string' &&
      binding.executionId.trim().length > 0
        ? { executionId: binding.executionId.trim() }
        : {}),
      ...(typeof binding.agentConversationId === 'string' &&
      binding.agentConversationId.trim().length > 0
        ? { agentConversationId: binding.agentConversationId.trim() }
        : {}),
      ...(typeof binding.sandboxNodeId === 'string' &&
      binding.sandboxNodeId.trim().length > 0
        ? { sandboxNodeId: binding.sandboxNodeId.trim() }
        : {}),
    };
  }

  private hasBindingIdentity(binding: SandboxBindingRef): boolean {
    return (
      typeof binding.executionId === 'string' ||
      typeof binding.agentConversationId === 'string'
    );
  }

  private bindingKey(binding: SandboxBindingRef): string {
    return `${binding.executionId ?? ''}|${binding.agentConversationId ?? ''}|${binding.sandboxNodeId ?? ''}`;
  }

  private dedupeBindings(bindings: SandboxBindingRef[]): SandboxBindingRef[] {
    const seen = new Set<string>();

    return bindings.filter((binding) => {
      const normalizedBinding = this.normalizeBinding(binding);
      if (!this.hasBindingIdentity(normalizedBinding)) {
        return false;
      }

      const key = this.bindingKey(normalizedBinding);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private bindingsEqual(
    left: SandboxBindingRef,
    right: SandboxBindingRef,
  ): boolean {
    return (
      (left.executionId ?? null) === (right.executionId ?? null) &&
      (left.agentConversationId ?? null) ===
        (right.agentConversationId ?? null) &&
      (left.sandboxNodeId ?? null) === (right.sandboxNodeId ?? null)
    );
  }

  private bindingsShareContext(
    left: SandboxBindingRef,
    right: SandboxBindingRef,
  ): boolean {
    return (
      (left.executionId ?? null) === (right.executionId ?? null) &&
      (left.agentConversationId ?? null) === (right.agentConversationId ?? null)
    );
  }

  private getPersistentBindings(session: SandboxSession): SandboxBindingRef[] {
    const configBindings = Array.isArray(session.config.activeBindings)
      ? this.dedupeBindings(
          session.config.activeBindings.map((binding) =>
            this.normalizeBinding(binding),
          ),
        )
      : [];

    if (configBindings.length > 0) {
      return configBindings;
    }

    const legacyBinding = this.normalizeBinding({
      executionId: session.executionId,
      agentConversationId: session.agentConversationId,
      sandboxNodeId: session.sandboxNodeId,
    });

    return this.hasBindingIdentity(legacyBinding) ? [legacyBinding] : [];
  }

  private projectPersistentBindingState(bindings: SandboxBindingRef[]): {
    executionId: string | null;
    agentConversationId: string | null;
    sandboxNodeId: string | null;
  } {
    const normalizedBindings = this.dedupeBindings(bindings);

    if (normalizedBindings.length === 0) {
      return {
        executionId: null,
        agentConversationId: null,
        sandboxNodeId: null,
      };
    }

    const executionIds = [
      ...new Set(
        normalizedBindings
          .map((binding) => binding.executionId)
          .filter((value): value is string => typeof value === 'string'),
      ),
    ];
    const agentConversationIds = [
      ...new Set(
        normalizedBindings
          .map((binding) => binding.agentConversationId)
          .filter((value): value is string => typeof value === 'string'),
      ),
    ];

    return {
      executionId: executionIds.length === 1 ? executionIds[0] : null,
      agentConversationId:
        agentConversationIds.length === 1 ? agentConversationIds[0] : null,
      sandboxNodeId:
        normalizedBindings.length === 1
          ? (normalizedBindings[0].sandboxNodeId ?? null)
          : null,
    };
  }

  private buildPersistentConfig(
    config: SandboxConfig,
    bindings: SandboxBindingRef[],
  ): SandboxConfig {
    const normalizedBindings = this.dedupeBindings(bindings);

    if (normalizedBindings.length === 0) {
      const { activeBindings: _activeBindings, ...rest } = config;
      return rest;
    }

    return {
      ...config,
      activeBindings: normalizedBindings,
    };
  }

  private shouldDetachPersistentBinding(
    candidate: SandboxBindingRef,
    target: SandboxBindingRef,
  ): boolean {
    if (!this.bindingsShareContext(candidate, target)) {
      return false;
    }

    if (typeof target.sandboxNodeId === 'string') {
      return candidate.sandboxNodeId === target.sandboxNodeId;
    }

    return true;
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
    sandboxNodeId?: string;
  }): string {
    if (params.executionId && params.agentConversationId) {
      return `execution ${params.executionId}${params.sandboxNodeId ? ` / sandbox ${params.sandboxNodeId}` : ''} / conversation ${params.agentConversationId}`;
    }

    if (params.executionId) {
      return `execution ${params.executionId}${params.sandboxNodeId ? ` / sandbox ${params.sandboxNodeId}` : ''}`;
    }

    return `conversation ${params.agentConversationId}`;
  }

  private getBoundConversationIds(session: SandboxSession): string[] {
    const conversationIds = new Set<string>();

    if (typeof session.agentConversationId === 'string') {
      conversationIds.add(session.agentConversationId);
    }

    for (const binding of this.getPersistentBindings(session)) {
      if (typeof binding.agentConversationId === 'string') {
        conversationIds.add(binding.agentConversationId);
      }
    }

    return [...conversationIds];
  }

  private async cleanupExecutionSession(
    session: SandboxSession,
    tenantId: string,
  ): Promise<void> {
    const lifecycleMode = session.config.lifecycleMode ?? 'session';

    if (lifecycleMode === 'persistent') {
      await this.detachPersistentSession(session, tenantId, {
        executionId: session.executionId ?? undefined,
        sandboxNodeId: session.sandboxNodeId ?? undefined,
      });
      return;
    }

    await this.destroyActiveSandbox(
      {
        executionId: session.executionId ?? undefined,
        agentConversationId: session.agentConversationId ?? undefined,
        sandboxNodeId: session.sandboxNodeId ?? undefined,
        tenantId,
      },
      this.describeBinding({
        executionId: session.executionId ?? undefined,
        agentConversationId: session.agentConversationId ?? undefined,
        sandboxNodeId: session.sandboxNodeId ?? undefined,
      }),
    );
  }

  private async detachPersistentSession(
    session: SandboxSession,
    tenantId: string,
    binding: {
      executionId?: string;
      agentConversationId?: string;
      sandboxNodeId?: string;
    },
  ): Promise<void> {
    const targetBinding = this.normalizeBinding(binding);
    const remainingBindings = this.getPersistentBindings(session).filter(
      (candidateBinding) =>
        !this.shouldDetachPersistentBinding(candidateBinding, targetBinding),
    );
    const projectedBinding =
      this.projectPersistentBindingState(remainingBindings);
    const nextConfig = this.buildPersistentConfig(
      session.config,
      remainingBindings,
    );

    await runInTenantTransaction(this.db, tenantId, async () => {
      const tenantDb = getTenantDb(this.db);
      await tenantDb
        .update(schema.sandboxSessions)
        .set({
          executionId: projectedBinding.executionId,
          agentConversationId: projectedBinding.agentConversationId,
          sandboxNodeId: projectedBinding.sandboxNodeId,
          config: nextConfig,
        })
        .where(eq(schema.sandboxSessions.id, session.id));
    });

    await this.enqueueLifecycleTask(async () => {
      await this.lifecycleProducer.removeConversationIdleEndCheckTask(
        session.id,
      );
    });

    this.logger.log(
      `Persistent sandbox ${session.id} disconnected from ${this.describeBinding(binding)}`,
    );
  }

  private async attachPersistentSandbox(params: {
    executionId?: string;
    agentConversationId?: string;
    sandboxNodeId: string | null;
    persistentSandboxId: string;
    tenantId: string;
  }): Promise<SandboxSession> {
    const session = await this.getSessionById(params.persistentSandboxId);

    if ((session.config.lifecycleMode ?? 'session') !== 'persistent') {
      throw new SandboxNotPersistentException(params.persistentSandboxId);
    }

    const existingBindings = this.getPersistentBindings(session);
    const targetBinding = this.normalizeBinding({
      executionId: params.executionId,
      agentConversationId: params.agentConversationId,
      sandboxNodeId: params.sandboxNodeId,
    });

    const isAlreadyBoundToTarget = existingBindings.some((binding) =>
      this.bindingsEqual(binding, targetBinding),
    );
    const isBoundElsewhere = existingBindings.some(
      (binding) => !this.bindingsShareContext(binding, targetBinding),
    );

    if (isBoundElsewhere) {
      throw new SandboxInvalidStateException(
        session.id,
        session.status,
        `attach to ${this.describeBinding(targetBinding)}`,
      );
    }

    if (session.status === 'stopping') {
      throw new SandboxInvalidStateException(session.id, session.status, 'use');
    }

    if (!isAlreadyBoundToTarget) {
      const nextBindings = [...existingBindings, targetBinding];
      const projectedBinding = this.projectPersistentBindingState(nextBindings);
      const nextConfig = this.buildPersistentConfig(
        session.config,
        nextBindings,
      );

      await runInTenantTransaction(this.db, params.tenantId, async () => {
        const tenantDb = getTenantDb(this.db);
        await tenantDb
          .update(schema.sandboxSessions)
          .set({
            executionId: projectedBinding.executionId,
            agentConversationId: projectedBinding.agentConversationId,
            sandboxNodeId: projectedBinding.sandboxNodeId,
            config: nextConfig,
          })
          .where(eq(schema.sandboxSessions.id, session.id));
      });
    }

    if (session.status === 'stopped' || session.status === 'failed') {
      await this.startSandbox(session.id, params.tenantId);
    }

    const attached = await this.getSessionById(session.id);
    this.logger.log(
      `Attached persistent sandbox ${session.id} to ${this.describeBinding(targetBinding)}`,
    );

    return attached;
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
      bindingType?: SandboxBindingType;
      search?: string;
    },
  ): Promise<{
    data: SandboxListItem[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const { page, pageSize, status, lifecycleMode, bindingType, search } =
      query;
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

    if (bindingType === 'conversation') {
      conditions.push(
        sql`${schema.sandboxSessions.agentConversationId} IS NOT NULL`,
      );
    }

    if (bindingType === 'execution') {
      conditions.push(sql`${schema.sandboxSessions.executionId} IS NOT NULL`);
    }

    if (bindingType === 'resource') {
      conditions.push(
        sql`${schema.sandboxSessions.executionId} IS NULL AND ${schema.sandboxSessions.agentConversationId} IS NULL`,
      );
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          sql`${schema.sandboxSessions.config}->>'name' ILIKE ${pattern}`,
          sql`${schema.sandboxSessions.id}::text ILIKE ${pattern}`,
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
      data: data.map((session) => ({
        ...session,
        bindingType: this.deriveBindingType(session),
      })),
      meta: {
        page,
        pageSize,
        total: total_,
        totalPages: total_ === 0 ? 0 : Math.ceil(total_ / pageSize),
      },
    };
  }

  private deriveBindingType(session: SandboxSession): SandboxBindingType {
    if (session.agentConversationId) {
      return 'conversation';
    }

    if (session.executionId) {
      return 'execution';
    }

    return 'resource';
  }

  async createPersistentSandbox(
    tenantId: string,
    params: {
      name: string;
      cpu: number;
      memory: number;
      disk: number;
      conversationIdleAutoEndMinutes?: number;
    },
  ): Promise<SandboxSession> {
    const config: SandboxConfig = {
      cpu: params.cpu,
      memory: params.memory,
      disk: params.disk,
      timeout: DEFAULT_PERSISTENT_TIMEOUT,
      conversationIdleAutoEndMinutes:
        resolveSandboxConversationIdleAutoEndMinutes({
          conversationIdleAutoEndMinutes:
            params.conversationIdleAutoEndMinutes,
        }),
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

    await this.enqueueLifecycleTask(async () => {
      await this.lifecycleProducer.addCreateTask({
        sessionId: session.id,
        tenantId,
        config,
      });
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

    return this.buildContainerStats(session);
  }

  private async buildContainerStats(
    session: Pick<SandboxSession, 'id' | 'status' | 'containerId' | 'config'>,
  ): Promise<ContainerStats> {
    if (
      !session.containerId ||
      TERMINAL_STATUSES.includes(
        session.status as (typeof TERMINAL_STATUSES)[number],
      )
    ) {
      throw new SandboxStatsUnavailableException(session.id);
    }

    const stats = await this.dockerService.getContainerStats(
      session.containerId,
    );

    return {
      ...stats,
      ...(stats.diskUsage !== undefined
        ? { diskTotal: session.config.disk * GB_TO_BYTES }
        : {}),
    };
  }

  async stopSandbox(
    sessionId: string,
    tenantId: string,
  ): Promise<SandboxSession> {
    const session = await this.getSessionById(sessionId);
    const lifecycleMode = session.config.lifecycleMode ?? 'session';

    const stoppableStatuses = ['ready', 'busy', 'creating'];
    if (!stoppableStatuses.includes(session.status)) {
      throw new SandboxInvalidStateException(sessionId, session.status, 'stop');
    }

    const markedStopping = await this.markSessionStopping(sessionId);
    if (!markedStopping) {
      this.logger.debug(
        `Sandbox session ${sessionId} already stopping or stopped, skipping duplicate stop enqueue`,
      );
      return this.getSessionById(sessionId);
    }

    await this.enqueueLifecycleTask(async () => {
      await this.lifecycleProducer.removeConversationIdleEndCheckTask(
        sessionId,
      );
      if (lifecycleMode === 'persistent') {
        await this.lifecycleProducer.addStopTask({
          sessionId,
          tenantId,
          config: session.config,
          ...(session.executionId ? { executionId: session.executionId } : {}),
          ...(session.agentConversationId
            ? { agentConversationId: session.agentConversationId }
            : {}),
          ...(session.sandboxNodeId
            ? { sandboxNodeId: session.sandboxNodeId }
            : {}),
          ...(session.containerId ? { containerId: session.containerId } : {}),
          ...(session.config.persistencePath
            ? { persistencePath: session.config.persistencePath }
            : {}),
        });
        return;
      }

      await this.lifecycleProducer.addDestroyTask({
        sessionId,
        tenantId,
        ...(session.executionId ? { executionId: session.executionId } : {}),
        ...(session.agentConversationId
          ? { agentConversationId: session.agentConversationId }
          : {}),
        ...(session.sandboxNodeId
          ? { sandboxNodeId: session.sandboxNodeId }
          : {}),
        ...(session.containerId ? { containerId: session.containerId } : {}),
        ...(session.config.persistencePath
          ? { persistencePath: session.config.persistencePath }
          : {}),
      });
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

    const restartableStatuses = ['stopped', 'failed'];
    if (!restartableStatuses.includes(session.status)) {
      throw new SandboxInvalidStateException(
        sessionId,
        session.status,
        'start',
      );
    }

    const canRestartStoppedContainer =
      session.status === 'stopped' &&
      typeof session.containerId === 'string' &&
      session.containerId.length > 0;

    if (canRestartStoppedContainer) {
      await this.updateSessionStatus(sessionId, 'creating', {
        startedAt: null,
        stoppedAt: null,
      });

      await this.enqueueLifecycleTask(async () => {
        await this.lifecycleProducer.removeConversationIdleEndCheckTask(
          sessionId,
        );
        await this.lifecycleProducer.addStartTask({
          sessionId,
          tenantId,
          containerId: session.containerId!,
          config: session.config,
          ...(session.executionId ? { executionId: session.executionId } : {}),
          ...(session.agentConversationId
            ? { agentConversationId: session.agentConversationId }
            : {}),
          ...(session.sandboxNodeId
            ? { sandboxNodeId: session.sandboxNodeId }
            : {}),
        });
      });

      this.logger.log(
        `Enqueued restart for stopped persistent sandbox ${sessionId}`,
      );

      return this.getSessionById(sessionId);
    }

    if (session.containerId) {
      await this.dockerService
        .stopContainer(session.containerId)
        .catch((error) => {
          this.logger.warn(
            `Failed to stop stale container ${session.containerId} before restarting sandbox ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      await this.dockerService
        .removeContainer(session.containerId)
        .catch((error) => {
          this.logger.warn(
            `Failed to remove stale container ${session.containerId} before restarting sandbox ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }

    await this.updateSessionStatus(sessionId, 'creating', {
      containerId: null,
      workspacePath: null,
      startedAt: null,
      stoppedAt: null,
    });

    await this.enqueueLifecycleTask(async () => {
      await this.lifecycleProducer.removeConversationIdleEndCheckTask(
        sessionId,
      );
      await this.lifecycleProducer.addCreateTask({
        sessionId,
        tenantId,
        config: session.config,
        ...(session.executionId ? { executionId: session.executionId } : {}),
        ...(session.agentConversationId
          ? { agentConversationId: session.agentConversationId }
          : {}),
        ...(session.sandboxNodeId
          ? { sandboxNodeId: session.sandboxNodeId }
          : {}),
      });
    });

    this.logger.log(`Enqueued start for persistent sandbox ${sessionId}`);

    return this.getSessionById(sessionId);
  }

  async deleteSandbox(sessionId: string, tenantId: string): Promise<void> {
    const session = await this.getSessionById(sessionId);

    if ((session.config.lifecycleMode ?? 'session') !== 'persistent') {
      throw new SandboxNotPersistentException(sessionId);
    }

    await this.lifecycleProducer.removeTimeoutCheckTask(sessionId);
    await this.lifecycleProducer.removeConversationIdleEndCheckTask(sessionId);

    if (session.containerId) {
      try {
        if (
          !TERMINAL_STATUSES.includes(
            session.status as (typeof TERMINAL_STATUSES)[number],
          )
        ) {
          await this.dockerService.stopContainer(session.containerId);
        }
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
