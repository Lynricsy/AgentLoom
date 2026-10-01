import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AGENT_API_TERMINAL_RUN_STATUSES,
  AgentApiToolCallStatusSchema,
  type AgentApiRun,
  type AgentApiRunError,
  type AgentApiStreamEvent,
  type AgentApiToolCallSummary,
} from '@agentloom/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { agentApiRuns } from '../../database/schema/agent-api-runs.schema';
import { agentMessages } from '../../database/schema/agent-conversations.schema';
import { AgentApiEventStreamService } from './agent-api-event-stream.service';

const ACTIVE_RUN_STATUSES = ['queued', 'running'] as const;
const PUBLIC_STOP_REASONS = new Set<string>([
  'end_turn',
  'max_tokens',
  'cancelled',
]);
const TERMINAL_RUN_STATUSES = new Set<string>(AGENT_API_TERMINAL_RUN_STATUSES);

type TerminalRunStatus = (typeof AGENT_API_TERMINAL_RUN_STATUSES)[number];

/**
 * 对外 API run 的状态机：标记 running、在轮次持久化事务内写终态、提交后发布终态事件。
 *
 * 进程内登记 `conversationId → runId`（仅执行进程有意义），供事件 mirror 判断哪些
 * 对话事件需要写入 run 事件流。
 */
@Injectable()
export class AgentApiRunService {
  private readonly logger = new Logger(AgentApiRunService.name);
  private readonly localRuns = new Map<string, string>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly eventStream: AgentApiEventStreamService,
  ) {}

  getLocalRunId(conversationId: string): string | undefined {
    return this.localRuns.get(conversationId);
  }

  registerLocalRun(conversationId: string, runId: string): void {
    this.localRuns.set(conversationId, runId);
  }

  /** 跨租户查找对话当前的活跃 run（执行进程内的事件 mirror 使用，不在租户事务内） */
  async findActiveRunId(
    tenantId: string,
    conversationId: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ id: agentApiRuns.id })
      .from(agentApiRuns)
      .where(
        and(
          eq(agentApiRuns.tenantId, tenantId),
          eq(agentApiRuns.conversationId, conversationId),
          inArray(agentApiRuns.status, [...ACTIVE_RUN_STATUSES]),
        ),
      )
      .limit(1);

    return row?.id ?? null;
  }

  /** 按入参顺序返回契约形状的 run；不存在的 id 被跳过 */
  async loadRunDtos(
    dbClient: DrizzleDB,
    runIds: string[],
  ): Promise<AgentApiRun[]> {
    if (runIds.length === 0) {
      return [];
    }

    const userMessage = alias(agentMessages, 'user_message');
    const assistantMessage = alias(agentMessages, 'assistant_message');
    const rows = await dbClient
      .select({
        id: agentApiRuns.id,
        conversationId: agentApiRuns.conversationId,
        status: agentApiRuns.status,
        agentVersionId: agentApiRuns.agentVersionId,
        userMessageId: agentApiRuns.userMessageId,
        assistantMessageId: agentApiRuns.assistantMessageId,
        stopReason: agentApiRuns.stopReason,
        error: agentApiRuns.error,
        createdAt: agentApiRuns.createdAt,
        startedAt: agentApiRuns.startedAt,
        completedAt: agentApiRuns.completedAt,
        inputContent: userMessage.content,
        outputContent: assistantMessage.content,
        outputToolCalls: assistantMessage.toolCalls,
      })
      .from(agentApiRuns)
      .innerJoin(userMessage, eq(userMessage.id, agentApiRuns.userMessageId))
      .leftJoin(
        assistantMessage,
        eq(assistantMessage.id, agentApiRuns.assistantMessageId),
      )
      .where(inArray(agentApiRuns.id, runIds));

    const runsById = new Map(
      rows.map((row): [string, AgentApiRun] => [
        row.id,
        {
          id: row.id,
          conversationId: row.conversationId,
          status: row.status,
          agentVersionId: row.agentVersionId,
          input: { messageId: row.userMessageId, content: row.inputContent },
          output:
            row.assistantMessageId && row.outputContent !== null
              ? {
                  messageId: row.assistantMessageId,
                  content: row.outputContent,
                  toolCalls: summarizeToolCalls(row.outputToolCalls),
                }
              : null,
          stopReason:
            row.stopReason && PUBLIC_STOP_REASONS.has(row.stopReason)
              ? (row.stopReason as AgentApiRun['stopReason'])
              : null,
          error: row.error ?? null,
          createdAt: row.createdAt.toISOString(),
          startedAt: row.startedAt?.toISOString() ?? null,
          completedAt: row.completedAt?.toISOString() ?? null,
        },
      ]),
    );

    return runIds.flatMap((runId) => {
      const run = runsById.get(runId);
      return run ? [run] : [];
    });
  }

  /**
   * worker 取到待处理消息后、运行轮次前调用：把匹配的 queued run 标记为 running。
   * 返回被标记的 run id；Studio 对话没有 run，结果为 null。
   */
  async markRunning(params: {
    tenantId: string;
    conversationId: string;
    pendingMessageIds: string[];
    agentVersionId: string | null;
  }): Promise<string | null> {
    if (params.pendingMessageIds.length === 0) {
      return null;
    }

    const rows = await runInTenantTransaction(
      this.db,
      params.tenantId,
      async (tx) =>
        tx
          .update(agentApiRuns)
          .set({
            status: 'running',
            startedAt: sql`now()`,
            agentVersionId: params.agentVersionId,
          })
          .where(
            and(
              inArray(agentApiRuns.userMessageId, params.pendingMessageIds),
              eq(agentApiRuns.status, 'queued'),
            ),
          )
          .returning({ id: agentApiRuns.id }),
    );

    const runId = rows[0]?.id;
    if (!runId) {
      return null;
    }

    this.localRuns.set(params.conversationId, runId);
    await this.appendSafely(runId, {
      event: 'run.status',
      data: { runId, status: 'running' },
    });

    return runId;
  }

  /**
   * 在调用方的轮次持久化事务内写入终态，返回被更新的 run id。
   * 状态优先级：cancelled（stopReason）> failed（有 failure）> completed。
   */
  async finalizeTurnInTransaction(
    dbClient: DrizzleDB,
    params: {
      conversationId: string;
      pendingMessageIds: string[];
      assistantMessageId: string | null;
      stopReason: string;
      failure?: AgentApiRunError;
    },
  ): Promise<string[]> {
    if (params.pendingMessageIds.length === 0) {
      return [];
    }

    const status: TerminalRunStatus =
      params.stopReason === 'cancelled'
        ? 'cancelled'
        : params.failure
          ? 'failed'
          : 'completed';

    const rows = await dbClient
      .update(agentApiRuns)
      .set({
        status,
        assistantMessageId: params.assistantMessageId,
        stopReason: params.stopReason,
        error: status === 'failed' ? params.failure : null,
        completedAt: sql`now()`,
      })
      .where(
        and(
          eq(agentApiRuns.conversationId, params.conversationId),
          inArray(agentApiRuns.userMessageId, params.pendingMessageIds),
          inArray(agentApiRuns.status, [...ACTIVE_RUN_STATUSES]),
        ),
      )
      .returning({ id: agentApiRuns.id });

    return rows.map((row) => row.id);
  }

  /** 事务提交后调用：写入终态事件、设置事件流过期并解除进程内登记 */
  async publishTerminal(tenantId: string, runIds: string[]): Promise<void> {
    if (runIds.length === 0) {
      return;
    }

    const runs = await runInTenantTransaction(this.db, tenantId, async (tx) =>
      this.loadRunDtos(tx, runIds),
    );

    for (const run of runs) {
      if (!TERMINAL_RUN_STATUSES.has(run.status)) {
        continue;
      }

      if (this.localRuns.get(run.conversationId) === run.id) {
        this.localRuns.delete(run.conversationId);
      }

      await this.eventStream.append(run.id, {
        event: `run.${run.status as TerminalRunStatus}`,
        data: { run },
      });
      await this.eventStream.expire(run.id);
    }
  }

  /** 把对话的全部活跃 run 标记为 failed 并发布终态事件 */
  async failActiveRuns(params: {
    tenantId: string;
    conversationId: string;
    error: AgentApiRunError;
  }): Promise<void> {
    await this.settleActiveRuns(params.tenantId, params.conversationId, {
      status: 'failed',
      error: params.error,
    });
  }

  /** 把对话的全部活跃 run 标记为 cancelled 并发布终态事件 */
  async cancelActiveRuns(params: {
    tenantId: string;
    conversationId: string;
  }): Promise<void> {
    await this.settleActiveRuns(params.tenantId, params.conversationId, {
      status: 'cancelled',
      stopReason: 'cancelled',
      error: null,
    });
  }

  private async settleActiveRuns(
    tenantId: string,
    conversationId: string,
    patch: {
      status: 'failed' | 'cancelled';
      stopReason?: string;
      error: AgentApiRunError | null;
    },
  ): Promise<void> {
    const rows = await runInTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .update(agentApiRuns)
        .set({ ...patch, completedAt: sql`now()` })
        .where(
          and(
            eq(agentApiRuns.conversationId, conversationId),
            inArray(agentApiRuns.status, [...ACTIVE_RUN_STATUSES]),
          ),
        )
        .returning({ id: agentApiRuns.id }),
    );

    await this.publishTerminal(
      tenantId,
      rows.map((row) => row.id),
    );
  }

  /** 事件流是旁路：写入失败只记录日志，数据库状态才是 run 的真相 */
  private async appendSafely(
    runId: string,
    event: AgentApiStreamEvent,
  ): Promise<void> {
    try {
      await this.eventStream.append(runId, event);
    } catch (error) {
      this.logger.warn(
        `写入 run ${runId} 事件 ${event.event} 失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function summarizeToolCalls(
  toolCalls: Record<string, unknown>[] | null,
): AgentApiToolCallSummary[] {
  return (toolCalls ?? []).flatMap((call) => {
    const status = AgentApiToolCallStatusSchema.safeParse(call.status);
    if (
      typeof call.id !== 'string' ||
      typeof call.tool !== 'string' ||
      !status.success
    ) {
      return [];
    }

    return [{ id: call.id, tool: call.tool, status: status.data }];
  });
}
