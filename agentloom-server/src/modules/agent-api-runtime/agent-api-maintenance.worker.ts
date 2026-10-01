import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job } from 'bullmq';
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { agentApiRuns } from '../../database/schema/agent-api-runs.schema';
import { agentConversations } from '../../database/schema/agent-conversations.schema';
import { AgentApiRunService } from './agent-api-run.service';
import {
  AGENT_API_CONVERSATION_IDLE_HOURS_DEFAULT,
  AGENT_API_CONVERSATION_IDLE_HOURS_ENV,
  AGENT_API_IDEMPOTENCY_RETENTION_HOURS,
  AGENT_API_MAINTENANCE_JOB_NAME,
  AGENT_API_MAINTENANCE_QUEUE,
  AGENT_API_RUN_WORKER_LOST_ERROR,
  AGENT_API_STALE_RUN_HOURS,
} from './agent-api-runtime.constants';

/**
 * 对外 API 的定期清扫（跨租户，直接使用 DRIZZLE 原始连接）：
 * 1. 执行进程丢失后遗留的 queued/running run → failed/run-worker-lost；
 * 2. 超过保留期的幂等记录清空 idempotency_key / request_hash；
 * 3. 空闲过久的 API 对话结束，并发出 `agent-conversation.ended` 释放沙箱。
 */
@Injectable()
@Processor(AGENT_API_MAINTENANCE_QUEUE)
export class AgentApiMaintenanceWorker extends WorkerHost {
  private readonly logger = new Logger(AgentApiMaintenanceWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly runService: AgentApiRunService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== AGENT_API_MAINTENANCE_JOB_NAME) {
      return;
    }

    await this.failStaleRuns();
    await this.clearExpiredIdempotencyKeys();
    await this.endIdleConversations();
  }

  private async failStaleRuns(): Promise<void> {
    const staleRuns = await this.db
      .update(agentApiRuns)
      .set({
        status: 'failed',
        error: AGENT_API_RUN_WORKER_LOST_ERROR,
        completedAt: sql`now()`,
      })
      .where(
        and(
          inArray(agentApiRuns.status, ['queued', 'running']),
          lt(agentApiRuns.createdAt, hoursAgo(AGENT_API_STALE_RUN_HOURS)),
        ),
      )
      .returning({ id: agentApiRuns.id, tenantId: agentApiRuns.tenantId });

    const runIdsByTenant = new Map<string, string[]>();
    for (const run of staleRuns) {
      const runIds = runIdsByTenant.get(run.tenantId) ?? [];
      runIds.push(run.id);
      runIdsByTenant.set(run.tenantId, runIds);
    }

    for (const [tenantId, runIds] of runIdsByTenant) {
      try {
        await this.runService.publishTerminal(tenantId, runIds);
      } catch (error) {
        this.logger.warn(
          `发布租户 ${tenantId} 遗留 run 的终态事件失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (staleRuns.length > 0) {
      this.logger.log(`已将 ${staleRuns.length} 个遗留 run 标记为 failed`);
    }
  }

  private async clearExpiredIdempotencyKeys(): Promise<void> {
    await this.db
      .update(agentApiRuns)
      .set({ idempotencyKey: null, requestHash: null })
      .where(
        and(
          isNotNull(agentApiRuns.idempotencyKey),
          lt(
            agentApiRuns.createdAt,
            hoursAgo(AGENT_API_IDEMPOTENCY_RETENTION_HOURS),
          ),
        ),
      );
  }

  private async endIdleConversations(): Promise<void> {
    const endedConversations = await this.db
      .update(agentConversations)
      .set({ status: 'ended', updatedAt: sql`now()` })
      .where(
        and(
          eq(agentConversations.source, 'api'),
          eq(agentConversations.status, 'active'),
          lt(agentConversations.updatedAt, hoursAgo(this.resolveIdleHours())),
        ),
      )
      .returning({
        id: agentConversations.id,
        tenantId: agentConversations.tenantId,
      });

    // 与 AgentConversationService.emitConversationEnded 同形；API 对话没有创建人
    for (const conversation of endedConversations) {
      this.eventEmitter.emit('agent-conversation.ended', {
        conversationId: conversation.id,
        tenantId: conversation.tenantId,
        organizationId: conversation.tenantId,
        userId: null,
      });
    }

    if (endedConversations.length > 0) {
      this.logger.log(
        `已结束 ${endedConversations.length} 个空闲的 API 对话`,
      );
    }
  }

  private resolveIdleHours(): number {
    const configured = Number(
      this.configService.get<string | number>(
        AGENT_API_CONVERSATION_IDLE_HOURS_ENV,
      ),
    );

    return Number.isFinite(configured) && configured > 0
      ? configured
      : AGENT_API_CONVERSATION_IDLE_HOURS_DEFAULT;
  }
}

function hoursAgo(hours: number) {
  return sql`now() - (${hours} * interval '1 hour')`;
}
