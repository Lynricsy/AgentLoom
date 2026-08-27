import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { agentConversations } from '../../database/schema/agent-conversations.schema';
import type {
  SelfEvolutionCategory,
  SelfEvolutionPermissionRequest,
  SelfEvolutionRememberScope,
} from './self-evolution.types';

const SELF_EVOLUTION_PERMISSION_TIMEOUT_MS = 300_000;
const SELF_EVOLUTION_SHARED_POLL_INTERVAL_MS = 250;
const SELF_EVOLUTION_SHARED_KEY_TTL_SECONDS =
  Math.ceil(SELF_EVOLUTION_PERMISSION_TIMEOUT_MS / 1000) + 60;

type PermissionAction = 'approve' | 'deny' | 'cancelled';

interface PendingSelfEvolutionPermission {
  readonly sessionId: string;
  readonly conversationId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly permissionRequest: SelfEvolutionPermissionRequest;
  readonly promise: Promise<PermissionAction>;
  readonly timer: ReturnType<typeof setTimeout>;
  resolve(action: PermissionAction): void;
}

interface SharedPendingSelfEvolutionPermission {
  readonly sessionId: string;
  readonly conversationId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly permissionRequest: SelfEvolutionPermissionRequest;
}

interface SelfEvolutionMetadataShape {
  rememberedPolicies?: Record<string, 'approve' | 'deny'>;
}

@Injectable()
export class SelfEvolutionPermissionService {
  private readonly pendingBySession = new Map<
    string,
    Map<string, PendingSelfEvolutionPermission>
  >();
  private readonly pendingByConversation = new Map<
    string,
    Map<string, PendingSelfEvolutionPermission>
  >();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async getRememberedDecision(
    conversationId: string,
    category: SelfEvolutionCategory,
  ): Promise<'approve' | 'deny' | null> {
    const [conversation] = await this.tenantDb
      .select({
        metadata: agentConversations.metadata,
      })
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    const metadata = this.readSelfEvolutionMetadata(conversation?.metadata);
    const decision = metadata.rememberedPolicies?.[category];

    return decision === 'approve' || decision === 'deny' ? decision : null;
  }

  async registerPendingRequest(params: {
    sessionId: string;
    conversationId: string;
    toolCallId: string;
    toolName: string;
    permissionRequest: SelfEvolutionPermissionRequest;
  }): Promise<void> {
    const sessionResolvers =
      this.pendingBySession.get(params.sessionId) ?? new Map();
    const conversationResolvers =
      this.pendingByConversation.get(params.conversationId) ?? new Map();

    if (
      sessionResolvers.has(params.toolCallId) ||
      conversationResolvers.has(params.toolCallId)
    ) {
      throw new Error(
        `Self-evolution permission already pending for ${params.sessionId}/${params.toolCallId}`,
      );
    }

    let resolveFn!: (action: PermissionAction) => void;
    const promise = new Promise<PermissionAction>((resolve) => {
      resolveFn = resolve;
    });

    const cleanup = () => {
      clearTimeout(pending.timer);
      sessionResolvers.delete(params.toolCallId);
      conversationResolvers.delete(params.toolCallId);
      if (sessionResolvers.size === 0) {
        this.pendingBySession.delete(params.sessionId);
      }
      if (conversationResolvers.size === 0) {
        this.pendingByConversation.delete(params.conversationId);
      }
      void this.clearSharedPendingRequest(
        params.sessionId,
        params.conversationId,
        params.toolCallId,
      ).catch(() => undefined);
    };

    const pending: PendingSelfEvolutionPermission = {
      sessionId: params.sessionId,
      conversationId: params.conversationId,
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      permissionRequest: params.permissionRequest,
      promise,
      timer: setTimeout(() => {
        resolveFn('deny');
        cleanup();
      }, SELF_EVOLUTION_PERMISSION_TIMEOUT_MS),
      resolve(action: PermissionAction) {
        resolveFn(action);
        cleanup();
      },
    };

    sessionResolvers.set(params.toolCallId, pending);
    conversationResolvers.set(params.toolCallId, pending);
    this.pendingBySession.set(params.sessionId, sessionResolvers);
    this.pendingByConversation.set(
      params.conversationId,
      conversationResolvers,
    );

    await this.redisCacheService.set(
      this.buildPendingConversationKey(
        params.conversationId,
        params.toolCallId,
      ),
      JSON.stringify({
        sessionId: params.sessionId,
        conversationId: params.conversationId,
        toolCallId: params.toolCallId,
        toolName: params.toolName,
        permissionRequest: params.permissionRequest,
      } satisfies SharedPendingSelfEvolutionPermission),
      SELF_EVOLUTION_SHARED_KEY_TTL_SECONDS,
    );
  }

  async waitForResolution(
    sessionId: string,
    toolCallId: string,
  ): Promise<PermissionAction> {
    const pending = this.pendingBySession.get(sessionId)?.get(toolCallId);
    if (!pending) {
      throw new Error(
        `No pending self-evolution permission for ${sessionId}/${toolCallId}`,
      );
    }

    const controller = new AbortController();
    pending.promise.finally(() => controller.abort());

    const action = await Promise.race([
      pending.promise,
      this.waitForSharedDecision(pending, controller.signal),
    ]);

    if (this.pendingBySession.get(sessionId)?.get(toolCallId) === pending) {
      pending.resolve(action);
    }

    return action;
  }

  async hasConversationRequest(
    conversationId: string,
    toolCallId: string,
  ): Promise<boolean> {
    if (this.pendingByConversation.get(conversationId)?.has(toolCallId)) {
      return true;
    }

    // 跨进程的 live gate 只存在 Redis 中，审批守卫必须把它计入，
    // 否则尚未归档到 agent_messages 的合法请求会被误判为 404。
    return (await this.readSharedPendingRequest(conversationId, toolCallId)) !== null;
  }

  async resolveConversationRequest(params: {
    conversationId: string;
    toolCallId: string;
    action: 'approve' | 'deny';
    rememberScope?: SelfEvolutionRememberScope;
  }): Promise<boolean> {
    const pending = this.pendingByConversation
      .get(params.conversationId)
      ?.get(params.toolCallId);

    if (!pending) {
      const sharedPending = await this.readSharedPendingRequest(
        params.conversationId,
        params.toolCallId,
      );

      if (!sharedPending) {
        return false;
      }

      if (
        params.rememberScope === 'conversation_category' &&
        sharedPending.permissionRequest.category
      ) {
        await this.rememberDecision(
          params.conversationId,
          sharedPending.permissionRequest.category,
          params.action,
        );
      }

      await this.redisCacheService.set(
        this.buildDecisionKey(sharedPending.sessionId, params.toolCallId),
        params.action,
        SELF_EVOLUTION_SHARED_KEY_TTL_SECONDS,
      );

      return true;
    }

    if (
      params.rememberScope === 'conversation_category' &&
      pending.permissionRequest.category
    ) {
      await this.rememberDecision(
        params.conversationId,
        pending.permissionRequest.category,
        params.action,
      );
    }

    pending.resolve(params.action);
    return true;
  }

  async cloneRememberedPolicies(
    sourceConversationId: string,
    targetConversationId: string,
  ): Promise<void> {
    const [sourceConversation] = await this.tenantDb
      .select({
        metadata: agentConversations.metadata,
      })
      .from(agentConversations)
      .where(eq(agentConversations.id, sourceConversationId))
      .limit(1);

    const sourceMetadata = this.readSelfEvolutionMetadata(
      sourceConversation?.metadata,
    );
    const policies = sourceMetadata.rememberedPolicies ?? {};

    if (Object.keys(policies).length === 0) {
      return;
    }

    const [targetConversation] = await this.tenantDb
      .select({
        metadata: agentConversations.metadata,
      })
      .from(agentConversations)
      .where(eq(agentConversations.id, targetConversationId))
      .limit(1);

    const targetMetadata = this.readSelfEvolutionMetadata(
      targetConversation?.metadata,
    );
    targetMetadata.rememberedPolicies = {
      ...(targetMetadata.rememberedPolicies ?? {}),
      ...policies,
    };

    await this.tenantDb
      .update(agentConversations)
      .set({
        metadata: this.writeSelfEvolutionMetadata(
          targetConversation?.metadata,
          targetMetadata,
        ),
        updatedAt: new Date(),
      })
      .where(eq(agentConversations.id, targetConversationId));
  }

  private async rememberDecision(
    conversationId: string,
    category: SelfEvolutionCategory,
    action: 'approve' | 'deny',
  ): Promise<void> {
    const [conversation] = await this.tenantDb
      .select({
        id: agentConversations.id,
        metadata: agentConversations.metadata,
      })
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const metadata = this.readSelfEvolutionMetadata(conversation.metadata);
    metadata.rememberedPolicies = {
      ...(metadata.rememberedPolicies ?? {}),
      [category]: action,
    };

    await this.tenantDb
      .update(agentConversations)
      .set({
        metadata: this.writeSelfEvolutionMetadata(
          conversation.metadata,
          metadata,
        ),
        updatedAt: new Date(),
      })
      .where(and(eq(agentConversations.id, conversationId)));
  }

  private readSelfEvolutionMetadata(
    metadata: Record<string, unknown> | null | undefined,
  ): SelfEvolutionMetadataShape {
    const root =
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      metadata.selfEvolution &&
      typeof metadata.selfEvolution === 'object' &&
      !Array.isArray(metadata.selfEvolution)
        ? (metadata.selfEvolution as Record<string, unknown>)
        : null;

    const rememberedPolicies =
      root?.rememberedPolicies &&
      typeof root.rememberedPolicies === 'object' &&
      !Array.isArray(root.rememberedPolicies)
        ? Object.fromEntries(
            Object.entries(root.rememberedPolicies).filter(
              (entry): entry is [string, 'approve' | 'deny'] =>
                entry[1] === 'approve' || entry[1] === 'deny',
            ),
          )
        : undefined;

    return {
      ...(rememberedPolicies ? { rememberedPolicies } : {}),
    };
  }

  private writeSelfEvolutionMetadata(
    metadata: Record<string, unknown> | null | undefined,
    selfEvolution: SelfEvolutionMetadataShape,
  ): Record<string, unknown> {
    return {
      ...((metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata
        : {}) as Record<string, unknown>),
      selfEvolution: {
        rememberedPolicies: selfEvolution.rememberedPolicies ?? {},
      },
    };
  }

  private async waitForSharedDecision(
    pending: PendingSelfEvolutionPermission,
    signal: AbortSignal,
  ): Promise<PermissionAction> {
    while (!signal.aborted) {
      const currentPending = this.pendingBySession
        .get(pending.sessionId)
        ?.get(pending.toolCallId);
      if (currentPending !== pending) {
        return pending.promise;
      }

      const rawDecision = await this.redisCacheService.get(
        this.buildDecisionKey(pending.sessionId, pending.toolCallId),
      );
      if (
        rawDecision === 'approve' ||
        rawDecision === 'deny' ||
        rawDecision === 'cancelled'
      ) {
        return rawDecision;
      }

      await this.delay(SELF_EVOLUTION_SHARED_POLL_INTERVAL_MS, signal);
    }

    return pending.promise;
  }

  private async clearSharedPendingRequest(
    sessionId: string,
    conversationId: string,
    toolCallId: string,
  ): Promise<void> {
    await Promise.all([
      this.redisCacheService.del(
        this.buildPendingConversationKey(conversationId, toolCallId),
      ),
      this.redisCacheService.del(this.buildDecisionKey(sessionId, toolCallId)),
    ]);
  }

  private async readSharedPendingRequest(
    conversationId: string,
    toolCallId: string,
  ): Promise<SharedPendingSelfEvolutionPermission | null> {
    const raw = await this.redisCacheService.get(
      this.buildPendingConversationKey(conversationId, toolCallId),
    );
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        raw,
      ) as Partial<SharedPendingSelfEvolutionPermission>;
      if (
        typeof parsed.sessionId !== 'string' ||
        typeof parsed.conversationId !== 'string' ||
        typeof parsed.toolCallId !== 'string' ||
        typeof parsed.toolName !== 'string' ||
        !this.isPermissionRequest(parsed.permissionRequest)
      ) {
        return null;
      }

      return {
        sessionId: parsed.sessionId,
        conversationId: parsed.conversationId,
        toolCallId: parsed.toolCallId,
        toolName: parsed.toolName,
        permissionRequest: parsed.permissionRequest,
      };
    } catch {
      return null;
    }
  }

  private buildPendingConversationKey(
    conversationId: string,
    toolCallId: string,
  ): string {
    return `self_evolution:pending:conversation:${conversationId}:${toolCallId}`;
  }

  private buildDecisionKey(sessionId: string, toolCallId: string): string {
    return `self_evolution:decision:session:${sessionId}:${toolCallId}`;
  }

  private isPermissionRequest(
    value: unknown,
  ): value is SelfEvolutionPermissionRequest {
    const candidate =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as { description?: unknown })
        : null;

    return (
      candidate !== null &&
      typeof candidate.description === 'string' &&
      candidate.description.length > 0
    );
  }

  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve();
      };

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
