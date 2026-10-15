/**
 * 团队运行的生命周期：启动（建运行、成员对话与简报）、用量记账、确定性结束（完成/失败/取消）。
 *
 * 结束路径都经 `finalize`：`UPDATE … WHERE status='running'` 保证只结束一次；提交后结束成员对话、
 * 移除截止任务、广播状态，并推进工作流步骤（完成 → onNodeCompleted，失败 → onNodeFailed，取消不推进）。
 */
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { TeamFailureReason, TeamRunStatus } from '@agentloom/contracts';

import {
  runInTenantTransaction,
  transactionStorage,
} from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { agentConversations } from '../../database/schema/agent-conversations.schema';
import { agentDefinitions } from '../../database/schema/agent-definitions.schema';
import {
  teamMembers,
  type TeamMember,
} from '../../database/schema/team-members.schema';
import { teamMessages } from '../../database/schema/team-messages.schema';
import { teamRuns, type TeamRun } from '../../database/schema/team-runs.schema';
import { AgentConversationService } from '../agent-conversation/agent-conversation.service';
import {
  AGENT_CONVERSATION_LOOP_ENDED_EVENT,
  AGENT_CONVERSATION_TURN_PERSISTED_EVENT,
  type ConversationLoopEndedEvent,
  type ConversationTurnPersistedEvent,
} from '../agent-execution/agent-execution.events';
import { NodeSchedulerService } from '../execution/node-scheduler.service';
import { EventBridgeService } from '../execution/services/event-bridge.service';
import { StepStateMachineService } from '../execution/step-state-machine.service';
import type { ExecutionStatusChangedPayload } from '../execution/types/execution-event.types';
import { runAfterTenantCommit } from './team-after-commit.util';
import { buildMemberBrief } from './team-brief.builder';
import { TeamMailboxService } from './team-mailbox.service';
import {
  buildTeamDeadlineJobId,
  TEAM_CONTEXT_MAX_BYTES,
  TEAM_DEADLINE_JOB_NAME,
  TEAM_IDLE_NUDGE_AFTER_MS,
  TEAM_MAX_NUDGES,
  TEAM_RUNTIME_QUEUE,
} from './team.constants';
import {
  TEAM_MEMBER_CONVERSATION_CANCEL_EVENT,
  TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
  TEAM_RUN_START_REQUESTED_EVENT,
  type TeamMemberConversationEvent,
  type TeamRunStartedResult,
  type TeamRunStartRequestedEvent,
} from './team.events';
import { TeamConfigInvalidException } from './team.exceptions';
import type { TeamResult } from './team.types';

export interface TeamDeadlineJobData {
  tenantId: string;
  teamRunId: string;
}

export interface TeamRunSnapshot {
  run: TeamRun;
  members: TeamMember[];
}

type FinalizeOutcome =
  | { status: 'completed'; result: TeamResult }
  | { status: 'failed'; reason: TeamFailureReason; detail: string }
  | { status: 'cancelled' };

const NUDGE_MESSAGE =
  '所有成员已空闲且尚未提交结果：请整合现有信息后调用 team_submit_result，或继续向成员发送请求。';

@Injectable()
export class TeamRunService {
  private readonly logger = new Logger(TeamRunService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly conversationService: AgentConversationService,
    private readonly mailbox: TeamMailboxService,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly nodeScheduler: NodeSchedulerService,
    private readonly eventBridge: EventBridgeService,
    @InjectQueue(TEAM_RUNTIME_QUEUE) private readonly queue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** `team` 节点执行器经事件请求启动；异常向执行器传播，由其将节点置为失败 */
  @OnEvent(TEAM_RUN_START_REQUESTED_EVENT, { suppressErrors: false })
  async handleStartRequested(
    payload: TeamRunStartRequestedEvent,
  ): Promise<TeamRunStartedResult> {
    return this.start(payload);
  }

  async start(
    params: TeamRunStartRequestedEvent,
  ): Promise<TeamRunStartedResult> {
    const { tenantId, config } = params;
    const deadlineAt = new Date(
      Date.now() + config.budget.deadlineMinutes * 60_000,
    );
    const context = boundTeamContext(params.context);

    const snapshot = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const agentIds = [
          ...new Set(config.members.map((member) => member.agentDefinitionId)),
        ];
        const agents = await tx
          .select({
            id: agentDefinitions.id,
            name: agentDefinitions.name,
            status: agentDefinitions.status,
            publishedVersionId: agentDefinitions.publishedVersionId,
          })
          .from(agentDefinitions)
          .where(inArray(agentDefinitions.id, agentIds));
        const agentById = new Map(agents.map((agent) => [agent.id, agent]));

        const resolved = config.members.map((member) => {
          const agent = agentById.get(member.agentDefinitionId);
          if (!agent) {
            throw new TeamConfigInvalidException(
              `成员 ${member.role} 的 Agent ${member.agentDefinitionId} 不存在`,
            );
          }
          if (agent.status !== 'published' || !agent.publishedVersionId) {
            throw new TeamConfigInvalidException(
              `成员 ${member.role} 的 Agent「${agent.name}」未发布`,
            );
          }
          // 成员对话始终运行 Agent 的当前发布版本；指定其他版本无法兑现，按配置错误拒绝
          if (
            member.agentVersionId &&
            member.agentVersionId !== agent.publishedVersionId
          ) {
            throw new TeamConfigInvalidException(
              `成员 ${member.role} 指定的版本不是 Agent「${agent.name}」的当前发布版本`,
            );
          }
          return { member, publishedVersionId: agent.publishedVersionId };
        });

        const [run] = await tx
          .insert(teamRuns)
          .values({
            tenantId,
            executionId: params.executionId,
            stepId: params.stepId,
            nodeId: params.nodeId,
            config,
            taskText: params.taskText,
            context,
            budgetMaxTotalTokens: config.budget.maxTotalTokens,
            budgetMaxMessages: config.budget.maxMessages,
            deadlineAt,
          })
          .returning();

        const members: TeamMember[] = [];
        for (const { member, publishedVersionId } of resolved) {
          const [conversation] = await tx
            .insert(agentConversations)
            .values({
              agentDefinitionId: member.agentDefinitionId,
              tenantId,
              title: `Team ${member.role} · ${params.nodeId}`.slice(0, 255),
              source: 'team',
              createdBy: null,
              apiKeyId: null,
              metadata: { team: { teamRunId: run.id, role: member.role } },
            })
            .returning({ id: agentConversations.id });

          const [memberRow] = await tx
            .insert(teamMembers)
            .values({
              tenantId,
              teamRunId: run.id,
              role: member.role,
              agentDefinitionId: member.agentDefinitionId,
              agentVersionId: publishedVersionId,
              conversationId: conversation.id,
              isLead: member.isLead,
              canMessage: member.canMessage,
              instructions: member.instructions || null,
            })
            .returning();
          members.push(memberRow);

          // 简报与成员对话同事务写入：提交即保证每个成员都有第一条待处理消息
          await this.conversationService.insertUserMessage(
            tx,
            conversation.id,
            tenantId,
            {
              content: buildMemberBrief({
                objective: config.objective,
                taskText: params.taskText,
                context,
                budget: {
                  maxTotalTokens: config.budget.maxTotalTokens,
                  maxMessages: config.budget.maxMessages,
                  deadlineAt,
                },
                member: {
                  role: member.role,
                  isLead: member.isLead,
                  instructions: member.instructions,
                },
                members: config.members,
              }),
              contentType: 'text',
              metadata: { type: 'team_brief', teamRunId: run.id },
            },
          );
        }

        return { run, members };
      },
    );

    await runAfterTenantCommit(async () => {
      for (const member of snapshot.members) {
        await this.eventEmitter.emitAsync(
          TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
          {
            conversationId: member.conversationId,
            tenantId,
          } satisfies TeamMemberConversationEvent,
        );
      }
      await this.queue.add(
        TEAM_DEADLINE_JOB_NAME,
        { tenantId, teamRunId: snapshot.run.id } satisfies TeamDeadlineJobData,
        {
          jobId: buildTeamDeadlineJobId(snapshot.run.id),
          delay: Math.max(0, deadlineAt.getTime() - Date.now()),
        },
      );
      this.emitStatus(tenantId, snapshot);
    });

    this.logger.log(
      `团队运行 ${snapshot.run.id} 已启动（步骤 ${params.stepId}，${snapshot.members.length} 名成员）`,
    );
    return { teamRunId: snapshot.run.id };
  }

  async complete(
    tenantId: string,
    teamRunId: string,
    result: TeamResult,
  ): Promise<boolean> {
    return this.finalize(tenantId, teamRunId, { status: 'completed', result });
  }

  async fail(
    tenantId: string,
    teamRunId: string,
    reason: TeamFailureReason,
    detail?: string,
  ): Promise<boolean> {
    return this.finalize(tenantId, teamRunId, {
      status: 'failed',
      reason,
      detail: detail ?? reason,
    });
  }

  async cancel(tenantId: string, teamRunId: string): Promise<boolean> {
    return this.finalize(tenantId, teamRunId, { status: 'cancelled' });
  }

  async loadSnapshot(
    tenantId: string,
    teamRunId: string,
  ): Promise<TeamRunSnapshot | null> {
    return runInTenantTransaction(this.db, tenantId, async (tx) => {
      const [run] = await tx
        .select()
        .from(teamRuns)
        .where(eq(teamRuns.id, teamRunId))
        .limit(1);
      if (!run) {
        return null;
      }
      const members = await tx
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamRunId, teamRunId))
        .orderBy(teamMembers.createdAt, teamMembers.id);
      return { run, members };
    });
  }

  /** 结果不符合输出 Schema：计数加一并返回累计次数（团队已结束时返回 null） */
  async incrementSchemaInvalid(
    tenantId: string,
    teamRunId: string,
  ): Promise<number | null> {
    const [row] = await runInTenantTransaction(this.db, tenantId, (tx) =>
      tx
        .update(teamRuns)
        .set({
          schemaInvalidCount: sql`${teamRuns.schemaInvalidCount} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(teamRuns.id, teamRunId), eq(teamRuns.status, 'running')))
        .returning({ count: teamRuns.schemaInvalidCount }),
    );
    return row?.count ?? null;
  }

  /** 成员一轮落库：累计成员与团队用量，成员回到空闲；超出 tokens 预算即失败 */
  @OnEvent(AGENT_CONVERSATION_TURN_PERSISTED_EVENT)
  async handleTurnPersisted(
    payload: ConversationTurnPersistedEvent,
  ): Promise<void> {
    await transactionStorage.exit(() => this.recordMemberTurn(payload));
  }

  async recordMemberTurn(
    payload: ConversationTurnPersistedEvent,
  ): Promise<void> {
    const inputTokens = payload.usage?.inputTokens ?? 0;
    const outputTokens = payload.usage?.outputTokens ?? 0;
    const costUsd = payload.costUsd ?? 0;

    const updated = await runInTenantTransaction(
      this.db,
      payload.tenantId,
      async (tx) => {
        const now = new Date();
        const [member] = await tx
          .update(teamMembers)
          .set({
            usedInputTokens: sql`${teamMembers.usedInputTokens} + ${inputTokens}`,
            usedOutputTokens: sql`${teamMembers.usedOutputTokens} + ${outputTokens}`,
            usedCostUsd: sql`${teamMembers.usedCostUsd} + ${costUsd}`,
            turnCount: sql`${teamMembers.turnCount} + 1`,
            lastTurnAt: now,
            status: sql`CASE WHEN ${teamMembers.status} = 'running' THEN 'idle'::team_member_status_enum ELSE ${teamMembers.status} END`,
            updatedAt: now,
          })
          .where(eq(teamMembers.conversationId, payload.conversationId))
          .returning({ teamRunId: teamMembers.teamRunId });
        if (!member) {
          return null;
        }

        const [run] = await tx
          .update(teamRuns)
          .set({
            usedInputTokens: sql`${teamRuns.usedInputTokens} + ${inputTokens}`,
            usedOutputTokens: sql`${teamRuns.usedOutputTokens} + ${outputTokens}`,
            usedCostUsd: sql`${teamRuns.usedCostUsd} + ${costUsd}`,
            updatedAt: now,
          })
          .where(eq(teamRuns.id, member.teamRunId))
          .returning();
        return run ?? null;
      },
    );
    if (!updated || updated.status !== 'running') {
      return;
    }

    const usedTokens = updated.usedInputTokens + updated.usedOutputTokens;
    if (usedTokens >= updated.budgetMaxTotalTokens) {
      await this.fail(
        payload.tenantId,
        updated.id,
        'budget_exhausted',
        `已用 ${usedTokens} tokens，超过团队上限 ${updated.budgetMaxTotalTokens}`,
      );
      return;
    }
    await this.emitStatusById(payload.tenantId, updated.id);
  }

  /** 成员执行循环结束：失败的 lead 使团队失败，其他成员失败通知 lead */
  @OnEvent(AGENT_CONVERSATION_LOOP_ENDED_EVENT)
  async handleLoopEnded(payload: ConversationLoopEndedEvent): Promise<void> {
    await transactionStorage.exit(async () => {
      const nextStatus =
        payload.status === 'failed'
          ? ('failed' as const)
          : payload.status === 'cancelled'
            ? ('ended' as const)
            : ('idle' as const);
      const member = await runInTenantTransaction(
        this.db,
        payload.tenantId,
        async (tx) => {
          const [row] = await tx
            .update(teamMembers)
            .set({ status: nextStatus, updatedAt: new Date() })
            .where(
              and(
                eq(teamMembers.conversationId, payload.conversationId),
                ne(teamMembers.status, 'ended'),
              ),
            )
            .returning();
          if (!row) {
            return null;
          }
          const [run] = await tx
            .select({ status: teamRuns.status })
            .from(teamRuns)
            .where(eq(teamRuns.id, row.teamRunId))
            .limit(1);
          return run?.status === 'running' ? row : null;
        },
      );
      if (!member) {
        return;
      }

      if (payload.status === 'failed') {
        const errorMessage = payload.errorMessage ?? '未知错误';
        if (member.isLead) {
          await this.fail(
            payload.tenantId,
            member.teamRunId,
            'member_failed',
            `负责人 ${member.role} 执行失败：${errorMessage}`,
          );
          return;
        }
        const lead = await this.findLead(payload.tenantId, member.teamRunId);
        if (lead) {
          await this.mailbox.sendSystem(
            payload.tenantId,
            member.teamRunId,
            lead.id,
            `成员 ${member.role} 执行失败：${errorMessage}`,
          );
        }
      }
      await this.emitStatusById(payload.tenantId, member.teamRunId);
    });
  }

  /**
   * 工作流执行取消 → 取消其下运行中的团队；成员对话开始执行 → 成员置为 running。
   */
  @OnEvent('execution.status.changed')
  async handleExecutionStatusChanged(
    payload: ExecutionStatusChangedPayload & { tenantId: string },
  ): Promise<void> {
    await transactionStorage.exit(async () => {
      if (payload.executionType === 'conversation') {
        if (payload.status === 'running') {
          await this.markMemberRunning(payload.tenantId, payload.executionId);
        }
        return;
      }
      if (payload.status !== 'cancelled') {
        return;
      }

      const runs = await runInTenantTransaction(
        this.db,
        payload.tenantId,
        (tx) =>
          tx
            .select({ id: teamRuns.id })
            .from(teamRuns)
            .where(
              and(
                eq(teamRuns.executionId, payload.executionId),
                eq(teamRuns.status, 'running'),
              ),
            ),
      );
      for (const run of runs) {
        await this.cancel(payload.tenantId, run.id);
      }
    });
  }

  async handleDeadline(data: TeamDeadlineJobData): Promise<void> {
    await this.fail(
      data.tenantId,
      data.teamRunId,
      'deadline_exceeded',
      '团队运行超过截止时间',
    );
  }

  /** 催办 lead；催办次数用尽则以 no_result 失败 */
  async nudgeOrFail(tenantId: string, teamRunId: string): Promise<void> {
    const [nudged] = await runInTenantTransaction(this.db, tenantId, (tx) =>
      tx
        .update(teamRuns)
        .set({
          nudgeCount: sql`${teamRuns.nudgeCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(teamRuns.id, teamRunId),
            eq(teamRuns.status, 'running'),
            sql`${teamRuns.nudgeCount} < ${TEAM_MAX_NUDGES}`,
          ),
        )
        .returning({ id: teamRuns.id }),
    );

    if (!nudged) {
      await this.fail(
        tenantId,
        teamRunId,
        'no_result',
        `所有成员已空闲，催办 ${TEAM_MAX_NUDGES} 次后负责人仍未提交结果`,
      );
      return;
    }

    const lead = await this.findLead(tenantId, teamRunId);
    if (lead) {
      await this.mailbox.sendSystem(
        tenantId,
        teamRunId,
        lead.id,
        NUDGE_MESSAGE,
      );
    }
  }

  /**
   * 清扫（跨租户，原始连接）：所有成员空闲、无在途消息、最近一轮早于阈值且未提交结果的团队 → 催办或失败。
   */
  async sweepIdleRuns(): Promise<void> {
    const cutoff = new Date(
      Date.now() - TEAM_IDLE_NUDGE_AFTER_MS,
    ).toISOString();
    const idleRuns = await this.db
      .select({ id: teamRuns.id, tenantId: teamRuns.tenantId })
      .from(teamRuns)
      .where(
        and(
          eq(teamRuns.status, 'running'),
          sql`NOT EXISTS (SELECT 1 FROM ${teamMembers} WHERE ${teamMembers.teamRunId} = ${teamRuns.id} AND ${teamMembers.status} = 'running')`,
          sql`NOT EXISTS (SELECT 1 FROM ${teamMessages} WHERE ${teamMessages.teamRunId} = ${teamRuns.id} AND ${teamMessages.deliveryStatus} IN ('pending', 'delivered'))`,
          sql`COALESCE((SELECT max(${teamMembers.lastTurnAt}) FROM ${teamMembers} WHERE ${teamMembers.teamRunId} = ${teamRuns.id}), ${teamRuns.startedAt}) < ${cutoff}::timestamptz`,
        ),
      );

    for (const run of idleRuns) {
      try {
        await this.nudgeOrFail(run.tenantId, run.id);
      } catch (error) {
        this.logger.warn(
          `催办团队运行 ${run.id} 失败：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async markMemberRunning(
    tenantId: string,
    conversationId: string,
  ): Promise<void> {
    const [member] = await runInTenantTransaction(this.db, tenantId, (tx) =>
      tx
        .update(teamMembers)
        .set({ status: 'running', updatedAt: new Date() })
        .where(
          and(
            eq(teamMembers.conversationId, conversationId),
            eq(teamMembers.status, 'idle'),
          ),
        )
        .returning({ teamRunId: teamMembers.teamRunId }),
    );
    if (member) {
      await this.emitStatusById(tenantId, member.teamRunId);
    }
  }

  private async findLead(
    tenantId: string,
    teamRunId: string,
  ): Promise<TeamMember | null> {
    const [lead] = await runInTenantTransaction(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamRunId, teamRunId),
            eq(teamMembers.isLead, true),
          ),
        )
        .limit(1),
    );
    return lead ?? null;
  }

  private async finalize(
    tenantId: string,
    teamRunId: string,
    outcome: FinalizeOutcome,
  ): Promise<boolean> {
    const snapshot = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const now = new Date();
        const [run] = await tx
          .update(teamRuns)
          .set({
            status: outcome.status,
            ...(outcome.status === 'completed'
              ? { result: { ...outcome.result } }
              : {}),
            ...(outcome.status === 'failed'
              ? { failureReason: outcome.reason, failureDetail: outcome.detail }
              : {}),
            ...(outcome.status === 'cancelled'
              ? { failureReason: 'cancelled' as const }
              : {}),
            completedAt: now,
            updatedAt: now,
          })
          .where(
            and(eq(teamRuns.id, teamRunId), eq(teamRuns.status, 'running')),
          )
          .returning();
        if (!run) {
          return null;
        }

        await tx
          .update(teamMembers)
          .set({ status: 'ended', updatedAt: now })
          .where(
            and(
              eq(teamMembers.teamRunId, teamRunId),
              ne(teamMembers.status, 'failed'),
            ),
          );
        const members = await tx
          .select()
          .from(teamMembers)
          .where(eq(teamMembers.teamRunId, teamRunId))
          .orderBy(teamMembers.createdAt, teamMembers.id);
        return { run, members };
      },
    );
    if (!snapshot) {
      return false;
    }

    await runAfterTenantCommit(() =>
      this.afterFinalize(tenantId, snapshot, outcome),
    );
    this.logger.log(
      `团队运行 ${teamRunId} 结束：${outcome.status}${
        outcome.status === 'failed' ? `（${outcome.reason}）` : ''
      }`,
    );
    return true;
  }

  private async afterFinalize(
    tenantId: string,
    snapshot: TeamRunSnapshot,
    outcome: FinalizeOutcome,
  ): Promise<void> {
    const { run } = snapshot;

    for (const member of snapshot.members) {
      await this.eventEmitter.emitAsync(TEAM_MEMBER_CONVERSATION_CANCEL_EVENT, {
        conversationId: member.conversationId,
        tenantId,
      } satisfies TeamMemberConversationEvent);
    }

    try {
      await this.queue.remove(buildTeamDeadlineJobId(run.id));
    } catch (error) {
      // 截止任务自身触发结束时处于 active（被锁），移除失败无妨：它随后正常完成
      this.logger.debug(
        `移除团队 ${run.id} 截止任务失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    this.emitStatus(tenantId, snapshot);

    if (outcome.status === 'cancelled') {
      return;
    }

    try {
      if (outcome.status === 'completed') {
        await runInTenantTransaction(this.db, tenantId, () =>
          this.stepStateMachine.updateStepStatus(
            tenantId,
            run.stepId,
            'completed',
            { result: buildTeamStepResult(snapshot) },
          ),
        );
        await runInTenantTransaction(this.db, tenantId, () =>
          this.nodeScheduler.onNodeCompleted(
            run.executionId,
            run.stepId,
            tenantId,
          ),
        );
        return;
      }

      await runInTenantTransaction(this.db, tenantId, () =>
        this.stepStateMachine.updateStepStatus(tenantId, run.stepId, 'failed', {
          errorMessage: {
            message: outcome.detail,
            type: `team/${outcome.reason}`,
            nodeId: run.nodeId,
          },
        }),
      );
      await runInTenantTransaction(this.db, tenantId, () =>
        this.nodeScheduler.onNodeFailed(run.executionId, run.stepId, tenantId),
      );
    } catch (error) {
      // 步骤已被执行取消等路径改为终态时状态转换会被拒绝，团队结果仍保留在 team_runs
      this.logger.warn(
        `团队 ${run.id} 结束后推进步骤 ${run.stepId} 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async emitStatusById(
    tenantId: string,
    teamRunId: string,
  ): Promise<void> {
    const snapshot = await this.loadSnapshot(tenantId, teamRunId);
    if (snapshot) {
      this.emitStatus(tenantId, snapshot);
    }
  }

  private emitStatus(tenantId: string, snapshot: TeamRunSnapshot): void {
    const { run, members } = snapshot;
    this.eventBridge.emitTeamStatus(tenantId, run.executionId, {
      stepId: run.stepId,
      nodeId: run.nodeId,
      teamRunId: run.id,
      status: run.status satisfies TeamRunStatus,
      members: members.map((member) => ({
        memberId: member.id,
        role: member.role,
        isLead: member.isLead,
        status: member.status,
        usedTokens: member.usedInputTokens + member.usedOutputTokens,
      })),
      budget: {
        usedTokens: run.usedInputTokens + run.usedOutputTokens,
        maxTotalTokens: run.budgetMaxTotalTokens,
        messageCount: run.messageCount,
        maxMessages: run.budgetMaxMessages,
        deadlineAt: run.deadlineAt.toISOString(),
      },
      ...(run.failureReason ? { failureReason: run.failureReason } : {}),
    });
  }
}

/** context-in 输入超过上限时截断为文本，避免简报与运行行无限膨胀 */
export function boundTeamContext(context: unknown): unknown {
  if (context === undefined || context === null) {
    return null;
  }
  const serialized = JSON.stringify(context);
  if (serialized === undefined) {
    return null;
  }
  if (Buffer.byteLength(serialized, 'utf8') <= TEAM_CONTEXT_MAX_BYTES) {
    return context;
  }
  return {
    truncated: true,
    text: Buffer.from(serialized, 'utf8')
      .subarray(0, TEAM_CONTEXT_MAX_BYTES)
      .toString('utf8'),
  };
}

/** team 步骤的结果：端口值与工作流遥测读取的 token/成本字段 */
export function buildTeamStepResult(
  snapshot: TeamRunSnapshot,
): Record<string, unknown> {
  const { run, members } = snapshot;
  const result = (run.result ?? {}) as Partial<TeamResult>;
  const summary = result.summary ?? '';
  const usage = {
    inputTokens: run.usedInputTokens,
    outputTokens: run.usedOutputTokens,
    costUsd: run.usedCostUsd,
  };
  return {
    'exec-out': { triggered: true },
    'result-out': {
      teamRunId: run.id,
      summary,
      artifact: result.artifact ?? null,
      knownLimitations: result.knownLimitations ?? [],
      members: members.map((member) => ({
        role: member.role,
        agentDefinitionId: member.agentDefinitionId,
        turns: member.turnCount,
        usage: {
          inputTokens: member.usedInputTokens,
          outputTokens: member.usedOutputTokens,
          costUsd: member.usedCostUsd,
        },
      })),
      usage,
      messageCount: run.messageCount,
    },
    'summary-out': summary,
    promptTokens: run.usedInputTokens,
    completionTokens: run.usedOutputTokens,
    totalTokens: run.usedInputTokens + run.usedOutputTokens,
    costUsd: run.usedCostUsd,
  };
}
