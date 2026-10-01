import { createHash } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AGENT_API_TERMINAL_RUN_STATUSES,
  type AgentApiRun,
  type AgentApiRunError,
} from '@agentloom/contracts';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { agentApiKeys } from '../../database/schema/agent-api-keys.schema';
import { agentApiRuns } from '../../database/schema/agent-api-runs.schema';
import {
  agentConversations,
  agentMessages,
  type AgentConversation,
  type AgentMessage,
} from '../../database/schema/agent-conversations.schema';
import {
  agentDefinitions,
  agentVersions,
} from '../../database/schema/agent-definitions.schema';
import {
  AgentApiEventStreamService,
  compareStreamIds,
} from '../agent-api-runtime/agent-api-event-stream.service';
import { AgentApiRunService } from '../agent-api-runtime/agent-api-run.service';
import { AgentConversationService } from '../agent-conversation/agent-conversation.service';
import { readConversationAttachmentMetadataList } from '../agent-conversation/conversation-attachment';
import { serializeMessage } from '../agent-conversation/dto/message-response.dto';
import {
  AgentExecutionService,
  type AgentConversationMessageSentEvent,
} from '../agent-execution/agent-execution.service';
import { SandboxMaintenanceException } from '../sandbox/sandbox.exceptions';
import {
  AgentApiAgentArchivedException,
  AgentApiConversationNotFoundException,
  AgentApiKeyInvalidException,
  AgentApiRunNotFoundException,
  AgentApiValidationException,
  AgentNotPublishedException,
  ConcurrencyLimitExceededException,
  ConversationBusyException,
  ConversationEndedException,
  IdempotencyKeyReusedException,
  RunDispatchFailedException,
  RunEventsExpiredException,
  RunNotCancellableException,
} from './agent-api.exceptions';
import { isTerminalStreamEvent } from './agent-api-sse.util';
import type { AgentApiKeyContext } from './agent-api.types';
import {
  AGENT_API_RESERVED_CONVERSATION_METADATA_KEYS,
  type AgentApiPageQuery,
  type CreateAgentApiConversationDto,
  type CreateAgentApiRunDto,
  type ListAgentApiConversationsQuery,
} from './dto/agent-api-request.dto';
import type {
  AgentApiBoundAgent,
  AgentApiConversation,
  AgentApiMessage,
  AgentApiPageMeta,
} from './dto/agent-api-response.dto';

const ACTIVE_RUN_STATUSES = ['queued', 'running'] as const;
const TERMINAL_RUN_STATUSES: readonly string[] = AGENT_API_TERMINAL_RUN_STATUSES;
const ACTIVE_CONVERSATION_RUN_CONSTRAINT =
  'uq_agent_api_runs_active_conversation';
const IDEMPOTENCY_CONSTRAINT = 'uq_agent_api_runs_idempotency';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STREAM_ID_PATTERN = /^\d+-\d+$/;

/** 并发超限时建议的重试间隔（秒） */
const CONCURRENCY_RETRY_AFTER_SECONDS = 5;

const RUN_DISPATCH_FAILED_ERROR: AgentApiRunError = {
  type: 'https://agentloom.dev/errors/run-dispatch-failed',
  title: 'Run dispatch failed',
};

type Page<T> = { data: T[]; meta: AgentApiPageMeta };

type InsertRunOutcome =
  | { kind: 'created'; runId: string; messageId: string }
  | { kind: 'replayed'; run: AgentApiRun };

export interface CreateAgentApiRunResult {
  run: AgentApiRun;
  /** 命中 Idempotency-Key 重放，返回的是首次创建的 run */
  replayed: boolean;
}

export interface AgentApiRunEventsCursor {
  /** 从该 entry 之后开始投递；null 表示从流的开头 */
  afterId: string | null;
  /** run 已终态且游标已越过最后一条事件，不会再有新事件 */
  completed: boolean;
}

/**
 * 第三方经 Agent 专用 API Key 调用的对外接口。
 *
 * 请求没有 `request.user`，全局租户拦截器直接放行；这里每一步数据库访问都用显式的
 * 短租户事务，绝不在 SSE / Prefer wait 期间持有事务。
 */
@Injectable()
export class AgentApiService {
  private readonly logger = new Logger(AgentApiService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly runService: AgentApiRunService,
    private readonly eventStream: AgentApiEventStreamService,
    private readonly conversationService: AgentConversationService,
    private readonly executionService: AgentExecutionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getAgent(key: AgentApiKeyContext): Promise<AgentApiBoundAgent> {
    const [agent] = await runInTenantTransaction(
      this.db,
      key.tenantId,
      async (tx) =>
        tx
          .select({
            id: agentDefinitions.id,
            name: agentDefinitions.name,
            description: agentDefinitions.description,
            status: agentDefinitions.status,
            metadata: agentDefinitions.metadata,
            versionId: agentVersions.id,
            versionLabel: agentVersions.label,
            versionPublishedAt: agentVersions.publishedAt,
            versionSnapshot: agentVersions.snapshot,
          })
          .from(agentDefinitions)
          .leftJoin(
            agentVersions,
            eq(agentVersions.id, agentDefinitions.publishedVersionId),
          )
          .where(eq(agentDefinitions.id, key.agentDefinitionId))
          .limit(1),
    );

    if (!agent) {
      throw new AgentApiKeyInvalidException();
    }

    const inputSchema =
      readRecord(agent.metadata?.inputSchema) ??
      readRecord(agent.versionSnapshot?.metadata?.inputSchema);

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      publishedVersion:
        agent.versionId && agent.versionPublishedAt
          ? {
              id: agent.versionId,
              label: agent.versionLabel,
              publishedAt: agent.versionPublishedAt.toISOString(),
            }
          : null,
      inputSchema,
    };
  }

  async createConversation(
    key: AgentApiKeyContext,
    dto: CreateAgentApiConversationDto,
  ): Promise<AgentApiConversation> {
    const conversation = await runInTenantTransaction(
      this.db,
      key.tenantId,
      async (tx) => {
        await this.assertAgentAvailable(tx, key);

        const [row] = await tx
          .insert(agentConversations)
          .values({
            agentDefinitionId: key.agentDefinitionId,
            tenantId: key.tenantId,
            title: dto.title ?? null,
            metadata: dto.metadata ?? {},
            createdBy: null,
            source: 'api',
            apiKeyId: key.keyId,
            externalUserId: dto.externalUserId ?? null,
          })
          .returning();

        return row;
      },
    );

    return toConversationDto(conversation);
  }

  async listConversations(
    key: AgentApiKeyContext,
    query: ListAgentApiConversationsQuery,
  ): Promise<Page<AgentApiConversation>> {
    const where = and(
      eq(agentConversations.apiKeyId, key.keyId),
      eq(agentConversations.agentDefinitionId, key.agentDefinitionId),
      query.externalUserId
        ? eq(agentConversations.externalUserId, query.externalUserId)
        : undefined,
      query.status ? eq(agentConversations.status, query.status) : undefined,
    );

    const [rows, [{ total }]] = await runInTenantTransaction(
      this.db,
      key.tenantId,
      async (tx) =>
        Promise.all([
          tx
            .select()
            .from(agentConversations)
            .where(where)
            .orderBy(
              desc(agentConversations.createdAt),
              desc(agentConversations.id),
            )
            .limit(query.pageSize)
            .offset((query.page - 1) * query.pageSize),
          tx
            .select({ total: sql<number>`count(*)::int` })
            .from(agentConversations)
            .where(where),
        ]),
    );

    return {
      data: rows.map(toConversationDto),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getConversation(
    key: AgentApiKeyContext,
    conversationId: string,
  ): Promise<AgentApiConversation> {
    const conversation = await runInTenantTransaction(
      this.db,
      key.tenantId,
      async (tx) => this.loadOwnedConversation(tx, key, conversationId),
    );

    return toConversationDto(conversation);
  }

  /**
   * 幂等结束对话：走 Studio 同一结束路径（提交后发出 ended 事件 → 释放沙箱与工作区），
   * 再取消 queued run 并中止执行中的轮次（执行进程把 running run 终结为 cancelled）。
   */
  async endConversation(
    key: AgentApiKeyContext,
    conversationId: string,
  ): Promise<AgentApiConversation> {
    const conversation = await runInTenantTransaction(
      this.db,
      key.tenantId,
      async (tx) => this.loadOwnedConversation(tx, key, conversationId),
    );

    if (conversation.status === 'ended' || conversation.status === 'failed') {
      return toConversationDto(conversation);
    }

    await runInTenantTransaction(this.db, key.tenantId, async () => {
      try {
        await this.conversationService.cancel(conversationId);
      } catch (error) {
        // 并发结束时对话已不再 active，视为已结束
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
      }
    });
    await this.runService.cancelQueuedRuns({
      tenantId: key.tenantId,
      conversationId,
    });
    await this.executionService.abortExecution(conversationId);

    return this.getConversation(key, conversationId);
  }

  async listMessages(
    key: AgentApiKeyContext,
    conversationId: string,
    query: AgentApiPageQuery,
  ): Promise<Page<AgentApiMessage>> {
    const where = and(
      eq(agentMessages.conversationId, conversationId),
      inArray(agentMessages.role, ['user', 'assistant']),
    );

    const [rows, [{ total }]] = await runInTenantTransaction(
      this.db,
      key.tenantId,
      async (tx) => {
        await this.loadOwnedConversation(tx, key, conversationId);
        return Promise.all([
          tx
            .select()
            .from(agentMessages)
            .where(where)
            .orderBy(asc(agentMessages.createdAt), asc(agentMessages.id))
            .limit(query.pageSize)
            .offset((query.page - 1) * query.pageSize),
          tx
            .select({ total: sql<number>`count(*)::int` })
            .from(agentMessages)
            .where(where),
        ]);
      },
    );

    return {
      data: rows.map(toMessageDto),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /**
   * 写入用户消息并创建 queued run，提交后写入 `run.created` 事件并派发执行。
   * 并发控制见设计文档 7.3：锁住 Key 行串行化同一 Key 的建 run 请求，再计数。
   */
  async createRun(
    key: AgentApiKeyContext,
    conversationId: string,
    params: { body: CreateAgentApiRunDto; idempotencyKey?: string },
  ): Promise<CreateAgentApiRunResult> {
    if (process.env.APP_SANDBOX_MAINTENANCE_MODE === 'true') {
      throw new SandboxMaintenanceException('execute');
    }

    // 路径里的对话 id 一并参与哈希：同一 Idempotency-Key 换对话重放视为不同请求
    const requestHash = createHash('sha256')
      .update(canonicalJson({ conversationId, body: params.body }))
      .digest('hex');
    const { idempotencyKey } = params;

    if (idempotencyKey) {
      const replay = await runInTenantTransaction(
        this.db,
        key.tenantId,
        async (tx) =>
          this.findIdempotentRun(tx, key, idempotencyKey, requestHash),
      );
      if (replay) {
        return { run: replay, replayed: true };
      }
    }

    let outcome: InsertRunOutcome | undefined;
    for (let attempt = 0; !outcome; attempt += 1) {
      try {
        outcome = await this.insertRun(
          key,
          conversationId,
          params.body,
          idempotencyKey,
          requestHash,
        );
      } catch (error) {
        const constraint = readUniqueViolationConstraint(error);

        if (constraint === ACTIVE_CONVERSATION_RUN_CONSTRAINT) {
          const activeRunId = await this.runService.findActiveRunId(
            key.tenantId,
            conversationId,
          );
          if (activeRunId) {
            throw new ConversationBusyException(activeRunId);
          }
          // 冲突的 run 在两次读取之间已结束：重试一次
          if (attempt === 0) {
            continue;
          }
        }

        if (constraint === IDEMPOTENCY_CONSTRAINT && idempotencyKey) {
          const replay = await runInTenantTransaction(
            this.db,
            key.tenantId,
            async (tx) =>
              this.findIdempotentRun(tx, key, idempotencyKey, requestHash),
          );
          if (replay) {
            return { run: replay, replayed: true };
          }
        }

        throw error;
      }
    }

    if (outcome.kind === 'replayed') {
      return { run: outcome.run, replayed: true };
    }

    const { runId, messageId } = outcome;
    const [run] = await runInTenantTransaction(
      this.db,
      key.tenantId,
      async (tx) => this.runService.loadRunDtos(tx, [runId]),
    );

    try {
      await this.eventStream.append(runId, {
        event: 'run.created',
        data: { run },
      });
      await this.executionService.dispatchExecution(
        conversationId,
        key.tenantId,
      );
    } catch (error) {
      this.logger.error(
        `派发 run ${runId} 失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      try {
        await this.runService.failActiveRuns({
          tenantId: key.tenantId,
          conversationId,
          error: RUN_DISPATCH_FAILED_ERROR,
        });
      } catch (failError) {
        this.logger.error(
          `把派发失败的 run ${runId} 标记为 failed 时出错，留给清扫任务处理: ${
            failError instanceof Error ? failError.message : String(failError)
          }`,
        );
      }
      throw new RunDispatchFailedException(runId);
    }

    // 已同步派发；事件只通知其余监听者（如取消沙箱空闲自动结束）
    this.eventEmitter.emit('agent-conversation.message-sent', {
      conversationId,
      tenantId: key.tenantId,
      messageId,
      executionDispatched: true,
    } satisfies AgentConversationMessageSentEvent);

    return { run, replayed: false };
  }

  /**
   * 等待 run 结束，最多 `seconds` 秒；返回等待结束时 run 的状态（可能仍未终态）。
   * 订阅从事件流开头读取，不会错过订阅前已写入的终态事件。
   */
  async waitForRun(
    key: AgentApiKeyContext,
    run: AgentApiRun,
    seconds: number,
    signal?: AbortSignal,
  ): Promise<AgentApiRun> {
    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      return run;
    }

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), seconds * 1000);
    const onExternalAbort = () => abort.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });
    const outcome: { run: AgentApiRun | null } = { run: null };

    try {
      await this.eventStream.subscribe(
        run.id,
        null,
        (entry) => {
          if (isTerminalStreamEvent(entry.event)) {
            outcome.run = entry.event.data.run;
            abort.abort();
          }
        },
        abort.signal,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
    }

    return (
      outcome.run ?? (await this.getRun(key, run.conversationId, run.id))
    );
  }

  async listRuns(
    key: AgentApiKeyContext,
    conversationId: string,
    query: AgentApiPageQuery,
  ): Promise<Page<AgentApiRun>> {
    return runInTenantTransaction(this.db, key.tenantId, async (tx) => {
      await this.loadOwnedConversation(tx, key, conversationId);
      const where = eq(agentApiRuns.conversationId, conversationId);
      const [rows, [{ total }]] = await Promise.all([
        tx
          .select({ id: agentApiRuns.id })
          .from(agentApiRuns)
          .where(where)
          .orderBy(desc(agentApiRuns.createdAt), desc(agentApiRuns.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        tx
          .select({ total: sql<number>`count(*)::int` })
          .from(agentApiRuns)
          .where(where),
      ]);

      return {
        data: await this.runService.loadRunDtos(
          tx,
          rows.map((row) => row.id),
        ),
        meta: { page: query.page, pageSize: query.pageSize, total },
      };
    });
  }

  async getRun(
    key: AgentApiKeyContext,
    conversationId: string,
    runId: string,
  ): Promise<AgentApiRun> {
    return runInTenantTransaction(this.db, key.tenantId, async (tx) =>
      this.loadOwnedRun(tx, key, conversationId, runId),
    );
  }

  /**
   * 幂等取消：queued 直接标记 cancelled；同时中止该对话可能已在准备阶段或执行中的 loop，
   * running run 由执行进程中止后终结为 cancelled。只中止执行，不结束对话。
   */
  async cancelRun(
    key: AgentApiKeyContext,
    conversationId: string,
    runId: string,
  ): Promise<AgentApiRun> {
    const run = await this.getRun(key, conversationId, runId);

    if (run.status === 'completed' || run.status === 'failed') {
      throw new RunNotCancellableException(runId);
    }
    if (run.status === 'cancelled') {
      return run;
    }

    if (run.status === 'queued') {
      await this.runService.cancelQueuedRun({
        tenantId: key.tenantId,
        conversationId,
        runId,
      });
    }
    await this.executionService.abortExecution(conversationId);

    return this.getRun(key, conversationId, runId);
  }

  /** 校验归属与事件流保留情况，返回 SSE 订阅游标 */
  async openRunEvents(
    key: AgentApiKeyContext,
    conversationId: string,
    runId: string,
    lastEventId?: string,
  ): Promise<AgentApiRunEventsCursor> {
    if (lastEventId !== undefined && !STREAM_ID_PATTERN.test(lastEventId)) {
      throw new AgentApiValidationException(
        'Last-Event-ID',
        'Last-Event-ID must look like <milliseconds>-<sequence>',
      );
    }

    const run = await this.getRun(key, conversationId, runId);
    const bounds = await this.eventStream.getBounds(runId);
    if (!bounds.exists || !bounds.firstId || !bounds.lastId) {
      throw new RunEventsExpiredException(runId);
    }

    // 断点早于仍保留的第一条事件（被裁剪）时，从剩余事件的开头续传
    const afterId =
      lastEventId && compareStreamIds(lastEventId, bounds.firstId) >= 0
        ? lastEventId
        : null;

    return {
      afterId,
      completed:
        TERMINAL_RUN_STATUSES.includes(run.status) &&
        afterId !== null &&
        compareStreamIds(afterId, bounds.lastId) >= 0,
    };
  }

  private async insertRun(
    key: AgentApiKeyContext,
    conversationId: string,
    body: CreateAgentApiRunDto,
    idempotencyKey: string | undefined,
    requestHash: string,
  ): Promise<InsertRunOutcome> {
    return runInTenantTransaction(this.db, key.tenantId, async (tx) => {
      const conversation = await this.loadOwnedConversation(
        tx,
        key,
        conversationId,
      );
      if (
        conversation.status === 'ended' ||
        conversation.status === 'failed'
      ) {
        throw new ConversationEndedException(conversationId);
      }

      await this.assertAgentAvailable(tx, key);

      // 锁住 Key 行，同一 Key 的建 run 请求在此串行化，计数与插入之间不会被并发插队
      const [lockedKey] = await tx
        .select({
          id: agentApiKeys.id,
          maxConcurrentRuns: agentApiKeys.maxConcurrentRuns,
        })
        .from(agentApiKeys)
        .where(eq(agentApiKeys.id, key.keyId))
        .for('update');
      if (!lockedKey) {
        throw new AgentApiKeyInvalidException();
      }

      // 持锁后再查一次：并发的同 key 请求可能刚提交
      if (idempotencyKey) {
        const replay = await this.findIdempotentRun(
          tx,
          key,
          idempotencyKey,
          requestHash,
        );
        if (replay) {
          return { kind: 'replayed', run: replay };
        }
      }

      const [{ activeRuns }] = await tx
        .select({ activeRuns: sql<number>`count(*)::int` })
        .from(agentApiRuns)
        .where(
          and(
            eq(agentApiRuns.apiKeyId, key.keyId),
            inArray(agentApiRuns.status, [...ACTIVE_RUN_STATUSES]),
          ),
        );
      if (activeRuns >= lockedKey.maxConcurrentRuns) {
        throw new ConcurrencyLimitExceededException(
          CONCURRENCY_RETRY_AFTER_SECONDS,
        );
      }

      const [activeConversationRun] = await tx
        .select({ id: agentApiRuns.id })
        .from(agentApiRuns)
        .where(
          and(
            eq(agentApiRuns.conversationId, conversationId),
            inArray(agentApiRuns.status, [...ACTIVE_RUN_STATUSES]),
          ),
        )
        .limit(1);
      if (activeConversationRun) {
        throw new ConversationBusyException(activeConversationRun.id);
      }

      const message = await this.insertUserMessage(
        tx,
        conversationId,
        key.tenantId,
        body,
      );

      const [run] = await tx
        .insert(agentApiRuns)
        .values({
          tenantId: key.tenantId,
          conversationId,
          apiKeyId: key.keyId,
          userMessageId: message.id,
          idempotencyKey: idempotencyKey ?? null,
          requestHash: idempotencyKey ? requestHash : null,
        })
        .returning({ id: agentApiRuns.id });

      return { kind: 'created', runId: run.id, messageId: message.id };
    });
  }

  /** 附件沿用 Studio 对话同一套规则；规则以 400 报错，这里统一为契约的 422 */
  private async insertUserMessage(
    tx: DrizzleDB,
    conversationId: string,
    tenantId: string,
    body: CreateAgentApiRunDto,
  ) {
    const attachments = body.input.attachments ?? [];
    const firstKind = attachments[0]?.kind;
    try {
      return await this.conversationService.insertUserMessage(
        tx,
        conversationId,
        tenantId,
        {
          content: body.input.content,
          contentType:
            firstKind &&
            attachments.every((attachment) => attachment.kind === firstKind)
              ? firstKind
              : 'text',
          ...(attachments.length > 0 ? { metadata: { attachments } } : {}),
        },
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new AgentApiValidationException(
          'input.attachments',
          error.message,
        );
      }
      throw error;
    }
  }

  private async findIdempotentRun(
    tx: DrizzleDB,
    key: AgentApiKeyContext,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<AgentApiRun | null> {
    const [existing] = await tx
      .select({ id: agentApiRuns.id, requestHash: agentApiRuns.requestHash })
      .from(agentApiRuns)
      .where(
        and(
          eq(agentApiRuns.apiKeyId, key.keyId),
          eq(agentApiRuns.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);

    if (!existing) {
      return null;
    }
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyKeyReusedException();
    }

    const [run] = await this.runService.loadRunDtos(tx, [existing.id]);
    return run ?? null;
  }

  private async assertAgentAvailable(
    tx: DrizzleDB,
    key: AgentApiKeyContext,
  ): Promise<void> {
    const [agent] = await tx
      .select({
        status: agentDefinitions.status,
        publishedVersionId: agentDefinitions.publishedVersionId,
      })
      .from(agentDefinitions)
      .where(eq(agentDefinitions.id, key.agentDefinitionId))
      .limit(1);

    if (!agent) {
      throw new AgentApiKeyInvalidException();
    }
    if (agent.status === 'archived') {
      throw new AgentApiAgentArchivedException(key.agentDefinitionId);
    }
    if (agent.status !== 'published' || !agent.publishedVersionId) {
      throw new AgentNotPublishedException(key.agentDefinitionId);
    }
  }

  /** 对话必须由当前 Key 创建且属于其绑定的 Agent，否则一律 404（不区分，避免泄露） */
  private async loadOwnedConversation(
    tx: DrizzleDB,
    key: AgentApiKeyContext,
    conversationId: string,
  ): Promise<AgentConversation> {
    if (!UUID_PATTERN.test(conversationId)) {
      throw new AgentApiConversationNotFoundException(conversationId);
    }

    const [conversation] = await tx
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.id, conversationId),
          eq(agentConversations.apiKeyId, key.keyId),
          eq(agentConversations.agentDefinitionId, key.agentDefinitionId),
        ),
      )
      .limit(1);

    if (!conversation) {
      throw new AgentApiConversationNotFoundException(conversationId);
    }
    return conversation;
  }

  private async loadOwnedRun(
    tx: DrizzleDB,
    key: AgentApiKeyContext,
    conversationId: string,
    runId: string,
  ): Promise<AgentApiRun> {
    await this.loadOwnedConversation(tx, key, conversationId);
    if (!UUID_PATTERN.test(runId)) {
      throw new AgentApiRunNotFoundException(runId);
    }

    const [run] = await this.runService.loadRunDtos(tx, [runId]);
    if (!run || run.conversationId !== conversationId) {
      throw new AgentApiRunNotFoundException(runId);
    }
    return run;
  }
}

function toConversationDto(row: AgentConversation): AgentApiConversation {
  // 执行进程写入的内部状态不对第三方暴露
  const metadata = Object.fromEntries(
    Object.entries(row.metadata ?? {}).filter(
      ([field]) =>
        !(AGENT_API_RESERVED_CONVERSATION_METADATA_KEYS as readonly string[]).includes(
          field,
        ),
    ),
  );

  return {
    id: row.id,
    title: row.title,
    // paused 不是对外状态：对话仍可继续使用
    status: row.status === 'paused' ? 'active' : row.status,
    externalUserId: row.externalUserId,
    metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessageDto(row: AgentMessage): AgentApiMessage {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    attachments: readConversationAttachmentMetadataList(row.metadata).map(
      ({ kind, fileName, mimeType, sizeBytes }) => ({
        kind,
        fileName,
        mimeType,
        sizeBytes,
      }),
    ),
    toolCalls: (serializeMessage(row).toolCalls ?? []).map(
      ({ id, tool, status }) => ({ id, tool, status }),
    ),
    createdAt: row.createdAt.toISOString(),
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 键排序后的 JSON，用于给请求体计算稳定哈希 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((field) => record[field] !== undefined)
      .sort()
      .map((field) => `${JSON.stringify(field)}:${canonicalJson(record[field])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 沿 cause 链找到 Postgres 唯一约束冲突（23505），返回约束名 */
function readUniqueViolationConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= 4; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    const record = current as Record<string, unknown>;
    if (record.code === '23505') {
      const name = record.constraint_name ?? record.constraint;
      return typeof name === 'string' ? name : undefined;
    }
    current = record.cause;
  }
  return undefined;
}
