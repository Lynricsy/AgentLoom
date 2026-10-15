/**
 * 团队邮箱：team_messages 即 Outbox。
 *
 * 发送：同一租户事务内插入每个接收者一行（pending）并递增 team_runs.message_count；
 * 提交后逐条投递：锁定行 → 写入接收者对话的 agent_messages → 置 delivered（同事务），
 * 提交后派发接收者对话。接收者下一回合处理该 agent_message 后置 consumed。
 * 投递幂等靠行锁 + `WHERE delivery_status='pending'`；投递丢失由周期清扫重投。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm';

import {
  runInTenantTransaction,
  transactionStorage,
} from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import { teamMembers } from '../../database/schema/team-members.schema';
import {
  teamMessages,
  type TeamMessage,
} from '../../database/schema/team-messages.schema';
import { teamRuns } from '../../database/schema/team-runs.schema';
import { AgentConversationService } from '../agent-conversation/agent-conversation.service';
import {
  AGENT_CONVERSATION_TURN_PERSISTED_EVENT,
  type ConversationTurnPersistedEvent,
} from '../agent-execution/agent-execution.events';
import { EventBridgeService } from '../execution/services/event-bridge.service';
import { runAfterTenantCommit } from './team-after-commit.util';
import { formatInboundTeamMessage } from './team-brief.builder';
import {
  TEAM_PENDING_REDELIVER_AFTER_MS,
  TEAM_UNCONSUMED_REDISPATCH_AFTER_MS,
} from './team.constants';
import {
  TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
  type TeamMemberConversationEvent,
} from './team.events';
import type {
  TeamMemberContext,
  TeamSendInput,
  TeamSendResult,
} from './team.types';

/** 单次清扫最多重投的 pending 行数，避免积压时一次清扫过长 */
const SWEEP_REDELIVER_BATCH = 500;
const MESSAGE_PREVIEW_MAX = 200;

@Injectable()
export class TeamMailboxService {
  private readonly logger = new Logger(TeamMailboxService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly conversationService: AgentConversationService,
    private readonly eventBridge: EventBridgeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findMemberByConversation(
    conversationId: string,
    tenantId: string,
  ): Promise<TeamMemberContext | null> {
    const [row] = await runInTenantTransaction(this.db, tenantId, (tx) =>
      tx
        .select({
          teamRunId: teamMembers.teamRunId,
          memberId: teamMembers.id,
          role: teamMembers.role,
          isLead: teamMembers.isLead,
          canMessage: teamMembers.canMessage,
          instructions: teamMembers.instructions,
          executionId: teamRuns.executionId,
          stepId: teamRuns.stepId,
          config: teamRuns.config,
        })
        .from(teamMembers)
        .innerJoin(teamRuns, eq(teamRuns.id, teamMembers.teamRunId))
        .where(eq(teamMembers.conversationId, conversationId))
        .limit(1),
    );
    if (!row) {
      return null;
    }

    return {
      tenantId,
      teamRunId: row.teamRunId,
      executionId: row.executionId,
      stepId: row.stepId,
      memberId: row.memberId,
      conversationId,
      role: row.role,
      isLead: row.isLead,
      canMessage: row.canMessage,
      instructions: row.instructions ?? '',
      outputSchema: row.config.outputSchema ?? null,
    };
  }

  /**
   * 写入消息并在提交后投递。成员消息受消息预算约束（原子判断）；系统消息不受预算阻断但同样计数。
   */
  async send(input: TeamSendInput): Promise<TeamSendResult> {
    if (input.recipients.length === 0) {
      return { ok: true, messageIds: [] };
    }

    const counted = input.recipients.filter(
      (recipient) => !recipient.suppressed,
    ).length;
    const outcome = await runInTenantTransaction(
      this.db,
      input.tenantId,
      async (tx) => {
        const [run] = await tx
          .update(teamRuns)
          .set({
            messageCount: sql`${teamRuns.messageCount} + ${counted}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(teamRuns.id, input.teamRunId),
              eq(teamRuns.status, 'running'),
              input.senderMemberId === null
                ? undefined
                : sql`${teamRuns.messageCount} + ${counted} <= ${teamRuns.budgetMaxMessages}`,
            ),
          )
          .returning({ deadlineAt: teamRuns.deadlineAt });

        if (!run) {
          const [current] = await tx
            .select({ status: teamRuns.status })
            .from(teamRuns)
            .where(eq(teamRuns.id, input.teamRunId))
            .limit(1);
          return {
            ok: false as const,
            reason:
              current?.status === 'running'
                ? ('budget_exhausted' as const)
                : ('run_not_running' as const),
          };
        }

        const rows = await tx
          .insert(teamMessages)
          .values(
            input.recipients.map((recipient) => ({
              ...(recipient.messageId ? { id: recipient.messageId } : {}),
              tenantId: input.tenantId,
              teamRunId: input.teamRunId,
              senderMemberId: input.senderMemberId,
              recipientMemberId: recipient.memberId,
              kind: input.kind,
              content: input.content,
              refs: input.refs ?? [],
              replyToMessageId: input.replyToMessageId ?? null,
              deliveryStatus: recipient.suppressed
                ? ('suppressed' as const)
                : ('pending' as const),
              decisionRecordId: recipient.decisionRecordId ?? null,
              expiresAt: run.deadlineAt,
            })),
          )
          .returning();
        return { ok: true as const, rows };
      },
    );

    if (!outcome.ok) {
      return outcome;
    }

    await runAfterTenantCommit(async () => {
      await this.emitMessageEvents(input.tenantId, outcome.rows);
      await this.deliverPending(
        input.tenantId,
        outcome.rows
          .filter((row) => row.deliveryStatus === 'pending')
          .map((row) => row.id),
      );
    });

    return { ok: true, messageIds: outcome.rows.map((row) => row.id) };
  }

  async sendSystem(
    tenantId: string,
    teamRunId: string,
    recipientMemberId: string,
    content: string,
  ): Promise<TeamSendResult> {
    return this.send({
      tenantId,
      teamRunId,
      senderMemberId: null,
      recipients: [{ memberId: recipientMemberId }],
      kind: 'system',
      content,
    });
  }

  /** 逐条投递 pending 行；单条失败只记录，留给清扫重投 */
  async deliverPending(tenantId: string, messageIds: string[]): Promise<void> {
    for (const messageId of messageIds) {
      try {
        await this.deliverOne(tenantId, messageId);
      } catch (error) {
        this.logger.warn(
          `投递团队消息 ${messageId} 失败，等待清扫重投：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async deliverOne(tenantId: string, messageId: string): Promise<void> {
    const delivered = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(teamMessages)
          .where(eq(teamMessages.id, messageId))
          .for('update');
        if (!row || row.deliveryStatus !== 'pending') {
          return null;
        }

        const [recipient] = await tx
          .select({
            conversationId: teamMembers.conversationId,
            conversationStatus: agentConversations.status,
          })
          .from(teamMembers)
          .innerJoin(
            agentConversations,
            eq(agentConversations.id, teamMembers.conversationId),
          )
          .where(eq(teamMembers.id, row.recipientMemberId))
          .limit(1);

        const now = new Date();
        if (
          !recipient ||
          recipient.conversationStatus !== 'active' ||
          (row.expiresAt !== null && row.expiresAt <= now)
        ) {
          const [expired] = await tx
            .update(teamMessages)
            .set({ deliveryStatus: 'expired' })
            .where(
              and(
                eq(teamMessages.id, messageId),
                eq(teamMessages.deliveryStatus, 'pending'),
              ),
            )
            .returning();
          return expired ? { row: expired, conversationId: null } : null;
        }

        let senderRole: string | null = null;
        if (row.senderMemberId) {
          const [sender] = await tx
            .select({ role: teamMembers.role })
            .from(teamMembers)
            .where(eq(teamMembers.id, row.senderMemberId))
            .limit(1);
          senderRole = sender?.role ?? null;
        }

        const message = await this.conversationService.insertUserMessage(
          tx,
          recipient.conversationId,
          tenantId,
          {
            content: formatInboundTeamMessage({
              senderRole,
              kind: row.kind,
              content: row.content,
              refs: row.refs,
            }),
            contentType: 'text',
            metadata: {
              type: 'team_message',
              teamMessageId: row.id,
              teamRunId: row.teamRunId,
              fromRole: senderRole,
              kind: row.kind,
              refs: row.refs,
              replyToMessageId: row.replyToMessageId,
            },
          },
        );

        const [updated] = await tx
          .update(teamMessages)
          .set({
            deliveryStatus: 'delivered',
            agentMessageId: message.id,
            deliveredAt: now,
          })
          .where(
            and(
              eq(teamMessages.id, messageId),
              eq(teamMessages.deliveryStatus, 'pending'),
            ),
          )
          .returning();
        if (!updated) {
          // 行锁下不应发生；抛出以回滚 agent_messages 插入
          throw new Error(`团队消息 ${messageId} 状态已变化`);
        }
        return { row: updated, conversationId: recipient.conversationId };
      },
    );

    if (!delivered) {
      return;
    }
    if (delivered.conversationId) {
      await this.eventEmitter.emitAsync(
        TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
        {
          conversationId: delivered.conversationId,
          tenantId,
        } satisfies TeamMemberConversationEvent,
      );
    }
    await this.emitMessageEvents(tenantId, [delivered.row]);
  }

  /** 接收者处理完本回合的 pending 用户消息：对应团队消息置 consumed */
  @OnEvent(AGENT_CONVERSATION_TURN_PERSISTED_EVENT)
  async handleTurnPersisted(
    payload: ConversationTurnPersistedEvent,
  ): Promise<void> {
    if (payload.processedMessageIds.length === 0) {
      return;
    }

    const rows = await transactionStorage.exit(() =>
      runInTenantTransaction(this.db, payload.tenantId, (tx) =>
        tx
          .update(teamMessages)
          .set({ deliveryStatus: 'consumed', consumedAt: new Date() })
          .where(
            and(
              inArray(teamMessages.agentMessageId, payload.processedMessageIds),
              eq(teamMessages.deliveryStatus, 'delivered'),
            ),
          )
          .returning(),
      ),
    );
    await this.emitMessageEvents(payload.tenantId, rows);
  }

  /** 每个接收者已投递未消费的消息数，键为成员 id */
  async countUnreadByRecipient(
    tenantId: string,
    teamRunId: string,
  ): Promise<Record<string, number>> {
    const rows = await runInTenantTransaction(this.db, tenantId, (tx) =>
      tx
        .select({
          memberId: teamMessages.recipientMemberId,
          count: sql<number>`count(*)::int`,
        })
        .from(teamMessages)
        .where(
          and(
            eq(teamMessages.teamRunId, teamRunId),
            eq(teamMessages.deliveryStatus, 'delivered'),
          ),
        )
        .groupBy(teamMessages.recipientMemberId),
    );
    return Object.fromEntries(rows.map((row) => [row.memberId, row.count]));
  }

  /** 成员对话最近一条 assistant 消息正文（决策输入用）；没有时为 null */
  async loadRecentAssistantOutput(
    tenantId: string,
    conversationId: string,
  ): Promise<string | null> {
    const [row] = await runInTenantTransaction(this.db, tenantId, (tx) =>
      tx
        .select({ content: agentMessages.content })
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.conversationId, conversationId),
            eq(agentMessages.role, 'assistant'),
          ),
        )
        .orderBy(desc(agentMessages.createdAt), desc(agentMessages.id))
        .limit(1),
    );
    return row?.content ?? null;
  }

  /**
   * 周期清扫（跨租户，原始连接）：
   * 1. pending 已过期（超过团队截止时间）→ expired；
   * 2. pending 超过重投阈值（提交后投递丢失）→ 重新投递；
   * 3. delivered 且对应 agent_messages 已被接收者对话的持久游标
   *    （`metadata.execution.lastProcessedMessageId`，按 created_at、id 排序）覆盖 → consumed
   *    （回合落库事件丢失时的补偿）；
   * 4. delivered 超过阈值仍未消费 → 重新派发接收者对话（运行中的团队）。
   */
  async sweep(): Promise<void> {
    const now = Date.now();

    const expired = await this.db
      .update(teamMessages)
      .set({ deliveryStatus: 'expired' })
      .where(
        and(
          eq(teamMessages.deliveryStatus, 'pending'),
          lt(teamMessages.expiresAt, new Date(now)),
        ),
      )
      .returning();
    for (const [tenantId, rows] of groupByTenant(expired)) {
      await this.emitMessageEvents(tenantId, rows);
    }

    const stale = await this.db
      .select({ id: teamMessages.id, tenantId: teamMessages.tenantId })
      .from(teamMessages)
      .where(
        and(
          eq(teamMessages.deliveryStatus, 'pending'),
          lt(
            teamMessages.createdAt,
            new Date(now - TEAM_PENDING_REDELIVER_AFTER_MS),
          ),
        ),
      )
      .orderBy(asc(teamMessages.createdAt))
      .limit(SWEEP_REDELIVER_BATCH);
    for (const [tenantId, rows] of groupByTenant(stale)) {
      await this.deliverPending(
        tenantId,
        rows.map((row) => row.id),
      );
    }

    const consumed = await this.db
      .update(teamMessages)
      .set({ deliveryStatus: 'consumed', consumedAt: new Date(now) })
      .where(
        and(
          eq(teamMessages.deliveryStatus, 'delivered'),
          isNotNull(teamMessages.agentMessageId),
          sql`EXISTS (SELECT 1 FROM ${teamMembers} AS recipient JOIN ${agentConversations} AS conversation ON conversation.id = recipient.conversation_id JOIN ${agentMessages} AS delivered ON delivered.id = ${teamMessages.agentMessageId} JOIN ${agentMessages} AS cursor_message ON cursor_message.conversation_id = conversation.id AND cursor_message.id::text = conversation.metadata #>> '{execution,lastProcessedMessageId}' WHERE recipient.id = ${teamMessages.recipientMemberId} AND (delivered.created_at, delivered.id) <= (cursor_message.created_at, cursor_message.id))`,
        ),
      )
      .returning();
    for (const [tenantId, rows] of groupByTenant(consumed)) {
      await this.emitMessageEvents(tenantId, rows);
    }

    const unconsumed = await this.db
      .selectDistinct({
        conversationId: teamMembers.conversationId,
        tenantId: teamMessages.tenantId,
      })
      .from(teamMessages)
      .innerJoin(
        teamMembers,
        eq(teamMembers.id, teamMessages.recipientMemberId),
      )
      .innerJoin(teamRuns, eq(teamRuns.id, teamMessages.teamRunId))
      .where(
        and(
          eq(teamRuns.status, 'running'),
          eq(teamMessages.deliveryStatus, 'delivered'),
          isNull(teamMessages.consumedAt),
          lt(
            teamMessages.deliveredAt,
            new Date(now - TEAM_UNCONSUMED_REDISPATCH_AFTER_MS),
          ),
        ),
      );
    for (const target of unconsumed) {
      await this.eventEmitter.emitAsync(
        TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
        target satisfies TeamMemberConversationEvent,
      );
    }
  }

  /** 广播团队消息的创建或投递状态变化；广播失败不影响邮箱状态 */
  private async emitMessageEvents(
    tenantId: string,
    rows: TeamMessage[],
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    try {
      const teamRunIds = [...new Set(rows.map((row) => row.teamRunId))];
      const { runs, members } = await runInTenantTransaction(
        this.db,
        tenantId,
        async (tx) => ({
          runs: await tx
            .select({
              id: teamRuns.id,
              executionId: teamRuns.executionId,
              stepId: teamRuns.stepId,
            })
            .from(teamRuns)
            .where(inArray(teamRuns.id, teamRunIds)),
          members: await tx
            .select({ id: teamMembers.id, role: teamMembers.role })
            .from(teamMembers)
            .where(inArray(teamMembers.teamRunId, teamRunIds)),
        }),
      );
      const runById = new Map(runs.map((run) => [run.id, run]));
      const roleById = new Map(
        members.map((member) => [member.id, member.role]),
      );

      for (const row of rows) {
        const run = runById.get(row.teamRunId);
        if (!run) {
          continue;
        }
        this.eventBridge.emitTeamMessage(tenantId, run.executionId, {
          stepId: run.stepId,
          teamRunId: row.teamRunId,
          messageId: row.id,
          fromRole: row.senderMemberId
            ? (roleById.get(row.senderMemberId) ?? null)
            : null,
          toRole: roleById.get(row.recipientMemberId) ?? '',
          kind: row.kind,
          preview: row.content.slice(0, MESSAGE_PREVIEW_MAX),
          deliveryStatus: row.deliveryStatus,
          createdAt: row.createdAt.toISOString(),
        });
      }
    } catch (error) {
      this.logger.warn(
        `广播团队消息事件失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function groupByTenant<T extends { tenantId: string }>(
  rows: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.tenantId) ?? [];
    group.push(row);
    groups.set(row.tenantId, group);
  }
  return groups;
}
