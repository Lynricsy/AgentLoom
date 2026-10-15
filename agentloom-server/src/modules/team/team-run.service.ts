/**
 * 团队运行的生命周期：启动（建运行、成员对话与简报）、用量结算、确定性结束（完成/失败/取消）与清扫恢复。
 *
 * - 用量：成员与团队累计由成员对话已落库 assistant 消息的 `metadata.usage/costUsd` 重算（幂等），
 *   输入计入缓存读写 token；回合落库事件与清扫调用同一重算，事件丢失不影响结果。
 * - 提交：lead 的 `team_submit_result` 只登记待定结果；lead 提交回合落库后在同一事务内结算用量并原子地
 *   判定预算（超预算 → budget_exhausted，否则完成），步骤结果使用结算后的快照。
 * - 结束：都经 `finalizeInTx`，`UPDATE … WHERE status='running'` 保证只结束一次；提交后结束成员对话、
 *   移除截止任务、广播状态，并推进工作流步骤（完成 → onNodeCompleted，失败 → onNodeFailed，取消不推进）。
 *   推进前校验本运行仍是该步骤的最新运行；推进失败或进程退出由清扫恢复分支幂等重做。
 */
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { TeamFailureReason, TeamRunStatus } from '@agentloom/contracts';

import {
  runInTenantTransaction,
  transactionStorage,
} from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import { agentDefinitions } from '../../database/schema/agent-definitions.schema';
import { executionSteps } from '../../database/schema/execution-steps.schema';
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
  TEAM_FINALIZE_RECOVERY_AFTER_MS,
  TEAM_IDLE_NUDGE_AFTER_MS,
  TEAM_MAX_NUDGES,
  TEAM_RUNTIME_QUEUE,
  TEAM_START_REDISPATCH_AFTER_MS,
  TEAM_SUBMITTED_SETTLE_AFTER_MS,
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

/** lead 提交结果的登记结果 */
export type TeamSubmitOutcome =
  'submitted' | 'already_submitted' | 'not_running';

export interface TeamSettleOptions {
  /** 本次结算由该成员对话的回合落库触发：成员从 running 回到 idle */
  idleConversationId?: string;
  /** 有待定结果时不等 lead 提交回合落库直接完成（lead 循环失败/取消、截止） */
  force?: boolean;
  /** 清扫兜底：结果提交早于该时间且 lead 不在运行时直接完成 */
  submittedBefore?: Date;
}

export type FinalizeOutcome =
  | { status: 'completed' }
  | { status: 'failed'; reason: TeamFailureReason; detail: string }
  | { status: 'cancelled'; detail?: string };

/** 执行进入这些状态时，其下仍在运行的团队被取消 */
const EXECUTION_TERMINAL_STATUSES: Record<string, true> = {
  completed: true,
  failed: true,
  cancelled: true,
};

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

        // 同一步骤仍在运行的旧团队（重跑前未结束）先取消，不推进步骤：新运行接管该步骤
        const staleRuns = await tx
          .select({ id: teamRuns.id })
          .from(teamRuns)
          .where(
            and(
              eq(teamRuns.stepId, params.stepId),
              eq(teamRuns.status, 'running'),
            ),
          )
          .for('update');
        const cancelledRuns: TeamRunSnapshot[] = [];
        for (const stale of staleRuns) {
          const cancelled = await this.finalizeInTx(tx, stale.id, {
            status: 'cancelled',
            detail: '同一步骤启动了新的团队运行',
          });
          if (cancelled) {
            cancelledRuns.push(cancelled);
          }
        }

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

        return { run, members, cancelledRuns };
      },
    );

    await runAfterTenantCommit(async () => {
      for (const cancelled of snapshot.cancelledRuns) {
        await this.afterFinalize(tenantId, cancelled, { status: 'cancelled' });
      }
      // 派发与截止登记失败只记录：清扫按「无落库回合的成员」重新派发、按 deadline_at 兜底截止
      for (const member of snapshot.members) {
        await this.dispatchMember(tenantId, member.conversationId);
      }
      try {
        await this.queue.add(
          TEAM_DEADLINE_JOB_NAME,
          {
            tenantId,
            teamRunId: snapshot.run.id,
          } satisfies TeamDeadlineJobData,
          {
            jobId: buildTeamDeadlineJobId(snapshot.run.id),
            delay: Math.max(0, deadlineAt.getTime() - Date.now()),
          },
        );
      } catch (error) {
        this.logger.warn(
          `登记团队 ${snapshot.run.id} 截止任务失败，由清扫按 deadline_at 兜底：${describeError(error)}`,
        );
      }
      this.emitStatus(tenantId, snapshot);
    });

    this.logger.log(
      `团队运行 ${snapshot.run.id} 已启动（步骤 ${params.stepId}，${snapshot.members.length} 名成员）`,
    );
    return { teamRunId: snapshot.run.id };
  }

  /**
   * lead 提交结果：只登记待定结果（团队仍 running），不立即完成。
   * 同一运行只接受一次提交；完成在 lead 提交回合落库、用量结算后发生。
   */
  async submitResult(
    tenantId: string,
    teamRunId: string,
    result: TeamResult,
  ): Promise<TeamSubmitOutcome> {
    const outcome = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tx): Promise<TeamSubmitOutcome> => {
        const [submitted] = await tx
          .update(teamRuns)
          .set({
            result: { ...result },
            resultSubmittedAt: sql`now()`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(teamRuns.id, teamRunId),
              eq(teamRuns.status, 'running'),
              isNull(teamRuns.result),
            ),
          )
          .returning({ id: teamRuns.id });
        if (submitted) {
          return 'submitted';
        }
        const [current] = await tx
          .select({ status: teamRuns.status })
          .from(teamRuns)
          .where(eq(teamRuns.id, teamRunId))
          .limit(1);
        return current?.status === 'running'
          ? 'already_submitted'
          : 'not_running';
      },
    );
    if (outcome === 'submitted') {
      await runAfterTenantCommit(() =>
        this.emitStatusById(tenantId, teamRunId),
      );
    }
    return outcome;
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

  /** 结果不符合输出 Schema：计数加一并返回累计次数（团队已结束或已提交时返回 null） */
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
        .where(
          and(
            eq(teamRuns.id, teamRunId),
            eq(teamRuns.status, 'running'),
            isNull(teamRuns.result),
          ),
        )
        .returning({ count: teamRuns.schemaInvalidCount }),
    );
    return row?.count ?? null;
  }

  /** 成员一轮落库：成员回到空闲，按持久数据重算用量并结算（预算、待定结果） */
  @OnEvent(AGENT_CONVERSATION_TURN_PERSISTED_EVENT)
  async handleTurnPersisted(
    payload: ConversationTurnPersistedEvent,
  ): Promise<void> {
    await transactionStorage.exit(() => this.recordMemberTurn(payload));
  }

  async recordMemberTurn(
    payload: ConversationTurnPersistedEvent,
  ): Promise<void> {
    const [member] = await runInTenantTransaction(
      this.db,
      payload.tenantId,
      (tx) =>
        tx
          .select({ teamRunId: teamMembers.teamRunId })
          .from(teamMembers)
          .where(eq(teamMembers.conversationId, payload.conversationId))
          .limit(1),
    );
    if (!member) {
      return;
    }
    await this.settle(payload.tenantId, member.teamRunId, {
      idleConversationId: payload.conversationId,
    });
  }

  /**
   * 结算（幂等）：锁定运行行，按持久数据重算用量，原子地判定预算与待定结果。
   * 返回结算后的运行状态；运行不存在返回 null。
   */
  async settle(
    tenantId: string,
    teamRunId: string,
    options: TeamSettleOptions = {},
  ): Promise<TeamRunStatus | null> {
    const settled = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [locked] = await tx
          .select()
          .from(teamRuns)
          .where(eq(teamRuns.id, teamRunId))
          .for('update');
        if (!locked) {
          return null;
        }
        if (locked.status !== 'running') {
          return { status: locked.status };
        }

        if (options.idleConversationId) {
          await tx
            .update(teamMembers)
            .set({
              status: sql`CASE WHEN ${teamMembers.status} = 'running' THEN 'idle'::team_member_status_enum ELSE ${teamMembers.status} END`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(teamMembers.teamRunId, teamRunId),
                eq(teamMembers.conversationId, options.idleConversationId),
              ),
            );
        }

        const snapshot = await this.recomputeUsageInTx(tx, locked);
        const outcome = decideSettlement(snapshot, options);
        if (!outcome) {
          return { status: 'running' as const, snapshot };
        }
        const finalized = await this.finalizeInTx(tx, teamRunId, outcome);
        return finalized
          ? { status: outcome.status, finalized, outcome }
          : { status: 'running' as const, snapshot };
      },
    );
    if (!settled) {
      return null;
    }

    if ('finalized' in settled && settled.finalized) {
      const { finalized, outcome } = settled;
      await runAfterTenantCommit(() =>
        this.afterFinalize(tenantId, finalized, outcome),
      );
    } else if ('snapshot' in settled && settled.snapshot) {
      const { snapshot } = settled;
      await runAfterTenantCommit(async () =>
        this.emitStatus(tenantId, snapshot),
      );
    }
    return settled.status;
  }

  /** 成员执行循环结束：更新成员状态；lead 有待定结果时结算完成，失败的 lead 使团队失败 */
  @OnEvent(AGENT_CONVERSATION_LOOP_ENDED_EVENT)
  async handleLoopEnded(payload: ConversationLoopEndedEvent): Promise<void> {
    await transactionStorage.exit(async () => {
      const nextStatus =
        payload.status === 'failed'
          ? ('failed' as const)
          : payload.status === 'cancelled'
            ? ('ended' as const)
            : ('idle' as const);
      const found = await runInTenantTransaction(
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
            .select({ status: teamRuns.status, result: teamRuns.result })
            .from(teamRuns)
            .where(eq(teamRuns.id, row.teamRunId))
            .limit(1);
          return run?.status === 'running'
            ? { member: row, hasPendingResult: run.result !== null }
            : null;
        },
      );
      if (!found) {
        return;
      }
      const { member } = found;

      if (member.isLead && found.hasPendingResult) {
        // 结果已提交：失败/取消的 lead 不会再有回合落库，结算后直接完成
        await this.settle(payload.tenantId, member.teamRunId, {
          force: payload.status !== 'idle',
        });
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
   * 工作流执行进入终态（完成/失败/取消）→ 取消其下仍在运行的团队（不推进步骤）；
   * 成员对话开始执行 → 成员置为 running。
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
      if (EXECUTION_TERMINAL_STATUSES[payload.status] !== true) {
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

  /** 截止时间到达：已有待定结果则结算完成，否则以 deadline_exceeded 失败 */
  async handleDeadline(data: TeamDeadlineJobData): Promise<void> {
    const status = await this.settle(data.tenantId, data.teamRunId, {
      force: true,
    });
    if (status !== 'running') {
      return;
    }
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
   * 周期清扫（跨租户，原始连接读取候选，逐个在租户事务内处理）：
   * 1. 运行中且已过截止时间 → 截止处理（不只依赖延迟任务）；
   * 2. 运行中 → 重算用量并结算；待定结果提交已久且 lead 不在运行 → 兜底完成；
   * 3. 启动已久仍无落库回合、未在运行的成员 → 重新派发（启动派发丢失）；
   * 4. 全员空闲且无在途消息、未提交结果 → 催办或失败；
   * 5. 终态团队而步骤仍 running、且为该步骤最新运行 → 幂等重做步骤终态与调度；
   * 6. 终态团队仍有 active 成员对话 → 结束成员对话。
   */
  async sweep(): Promise<void> {
    await this.sweepOverdueDeadlines();
    await this.sweepSettleRunningRuns();
    await this.sweepUnstartedMembers();
    await this.sweepIdleRuns();
    await this.sweepUnadvancedSteps();
    await this.sweepOrphanedMemberConversations();
  }

  async sweepOverdueDeadlines(): Promise<void> {
    const overdue = await this.db
      .select({ id: teamRuns.id, tenantId: teamRuns.tenantId })
      .from(teamRuns)
      .where(
        and(
          eq(teamRuns.status, 'running'),
          lt(teamRuns.deadlineAt, new Date()),
        ),
      );
    for (const run of overdue) {
      await this.guard(`截止团队运行 ${run.id}`, () =>
        this.handleDeadline({ tenantId: run.tenantId, teamRunId: run.id }),
      );
    }
  }

  async sweepSettleRunningRuns(): Promise<void> {
    const submittedBefore = new Date(
      Date.now() - TEAM_SUBMITTED_SETTLE_AFTER_MS,
    );
    const running = await this.db
      .select({ id: teamRuns.id, tenantId: teamRuns.tenantId })
      .from(teamRuns)
      .where(eq(teamRuns.status, 'running'));
    for (const run of running) {
      await this.guard(`结算团队运行 ${run.id}`, () =>
        this.settle(run.tenantId, run.id, { submittedBefore }),
      );
    }
  }

  async sweepUnstartedMembers(): Promise<void> {
    const cutoff = new Date(Date.now() - TEAM_START_REDISPATCH_AFTER_MS);
    const unstarted = await this.db
      .select({
        conversationId: teamMembers.conversationId,
        tenantId: teamMembers.tenantId,
      })
      .from(teamMembers)
      .innerJoin(teamRuns, eq(teamRuns.id, teamMembers.teamRunId))
      .innerJoin(
        agentConversations,
        eq(agentConversations.id, teamMembers.conversationId),
      )
      .where(
        and(
          eq(teamRuns.status, 'running'),
          lt(teamRuns.startedAt, cutoff),
          eq(teamMembers.turnCount, 0),
          eq(teamMembers.status, 'idle'),
          eq(agentConversations.status, 'active'),
        ),
      );
    for (const member of unstarted) {
      await this.dispatchMember(member.tenantId, member.conversationId);
    }
  }

  /** 所有成员空闲、无在途消息、最近一轮早于阈值且未提交结果的团队 → 催办或失败 */
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
          isNull(teamRuns.result),
          sql`NOT EXISTS (SELECT 1 FROM ${teamMembers} WHERE ${teamMembers.teamRunId} = ${teamRuns.id} AND ${teamMembers.status} = 'running')`,
          sql`NOT EXISTS (SELECT 1 FROM ${teamMessages} WHERE ${teamMessages.teamRunId} = ${teamRuns.id} AND ${teamMessages.deliveryStatus} IN ('pending', 'delivered'))`,
          sql`COALESCE((SELECT max(${teamMembers.lastTurnAt}) FROM ${teamMembers} WHERE ${teamMembers.teamRunId} = ${teamRuns.id}), ${teamRuns.startedAt}) < ${cutoff}::timestamptz`,
        ),
      );

    for (const run of idleRuns) {
      await this.guard(`催办团队运行 ${run.id}`, () =>
        this.nudgeOrFail(run.tenantId, run.id),
      );
    }
  }

  async sweepUnadvancedSteps(): Promise<void> {
    const cutoff = new Date(Date.now() - TEAM_FINALIZE_RECOVERY_AFTER_MS);
    const stuck = await this.db
      .select({ id: teamRuns.id, tenantId: teamRuns.tenantId })
      .from(teamRuns)
      .innerJoin(executionSteps, eq(executionSteps.id, teamRuns.stepId))
      .where(
        and(
          inArray(teamRuns.status, ['completed', 'failed']),
          isNotNull(teamRuns.completedAt),
          lt(teamRuns.completedAt, cutoff),
          eq(executionSteps.status, 'running'),
          // 本运行之后同一步骤没有更新的运行，也没有其他运行中的运行
          sql`NOT EXISTS (SELECT 1 FROM ${teamRuns} AS later WHERE later.step_id = ${teamRuns.stepId} AND later.id <> ${teamRuns.id} AND (later.status = 'running' OR (later.created_at, later.id) > (${teamRuns.createdAt}, ${teamRuns.id})))`,
        ),
      );
    for (const run of stuck) {
      await this.guard(`恢复团队 ${run.id} 的步骤推进`, async () => {
        const snapshot = await this.loadSnapshot(run.tenantId, run.id);
        if (snapshot) {
          await this.advanceStep(run.tenantId, snapshot.run);
        }
      });
    }
  }

  async sweepOrphanedMemberConversations(): Promise<void> {
    const cutoff = new Date(Date.now() - TEAM_FINALIZE_RECOVERY_AFTER_MS);
    const orphaned = await this.db
      .select({
        conversationId: teamMembers.conversationId,
        tenantId: teamMembers.tenantId,
      })
      .from(teamMembers)
      .innerJoin(teamRuns, eq(teamRuns.id, teamMembers.teamRunId))
      .innerJoin(
        agentConversations,
        eq(agentConversations.id, teamMembers.conversationId),
      )
      .where(
        and(
          ne(teamRuns.status, 'running'),
          isNotNull(teamRuns.completedAt),
          lt(teamRuns.completedAt, cutoff),
          inArray(agentConversations.status, ['active', 'paused']),
        ),
      );
    for (const member of orphaned) {
      await this.cancelMember(member.tenantId, member.conversationId);
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

  /**
   * 按成员对话已落库的 assistant 消息重算成员与团队用量（幂等）：
   * 输入 = inputTokens + cacheReadTokens + cacheWriteTokens（计数互不重叠），回合数 = assistant 消息数。
   * 调用方须已锁定运行行，保证同一运行的重算串行。
   */
  private async recomputeUsageInTx(
    tx: DrizzleDB,
    run: TeamRun,
  ): Promise<TeamRunSnapshot> {
    const totals = await tx
      .select({
        memberId: teamMembers.id,
        inputTokens:
          sql<number>`COALESCE(sum(${usageNumber('usage,inputTokens')} + ${usageNumber('usage,cacheReadTokens')} + ${usageNumber('usage,cacheWriteTokens')}), 0)`.mapWith(
            Number,
          ),
        outputTokens:
          sql<number>`COALESCE(sum(${usageNumber('usage,outputTokens')}), 0)`.mapWith(
            Number,
          ),
        costUsd:
          sql<number>`COALESCE(sum(${usageNumber('costUsd')}), 0)`.mapWith(
            Number,
          ),
        turnCount: sql<number>`count(${agentMessages.id})`.mapWith(Number),
        lastTurnAt: sql<Date | null>`max(${agentMessages.createdAt})`.mapWith(
          agentMessages.createdAt,
        ),
      })
      .from(teamMembers)
      .leftJoin(
        agentMessages,
        and(
          eq(agentMessages.conversationId, teamMembers.conversationId),
          eq(agentMessages.role, 'assistant'),
        ),
      )
      .where(eq(teamMembers.teamRunId, run.id))
      .groupBy(teamMembers.id);

    const now = new Date();
    const members: TeamMember[] = [];
    for (const total of totals) {
      const [member] = await tx
        .update(teamMembers)
        .set({
          usedInputTokens: total.inputTokens,
          usedOutputTokens: total.outputTokens,
          usedCostUsd: total.costUsd,
          turnCount: total.turnCount,
          ...(total.lastTurnAt ? { lastTurnAt: total.lastTurnAt } : {}),
          updatedAt: now,
        })
        .where(eq(teamMembers.id, total.memberId))
        .returning();
      if (member) {
        members.push(member);
      }
    }
    members.sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );

    const [updated] = await tx
      .update(teamRuns)
      .set({
        usedInputTokens: sumOf(totals, 'inputTokens'),
        usedOutputTokens: sumOf(totals, 'outputTokens'),
        usedCostUsd: sumOf(totals, 'costUsd'),
        updatedAt: now,
      })
      .where(eq(teamRuns.id, run.id))
      .returning();
    return { run: updated ?? run, members };
  }

  private async finalize(
    tenantId: string,
    teamRunId: string,
    outcome: FinalizeOutcome,
  ): Promise<boolean> {
    const snapshot = await runInTenantTransaction(this.db, tenantId, (tx) =>
      this.finalizeInTx(tx, teamRunId, outcome),
    );
    if (!snapshot) {
      return false;
    }

    await runAfterTenantCommit(() =>
      this.afterFinalize(tenantId, snapshot, outcome),
    );
    return true;
  }

  /** 事务内结束运行（只结束 running 的运行；完成要求已有提交结果），成员置 ended */
  private async finalizeInTx(
    tx: DrizzleDB,
    teamRunId: string,
    outcome: FinalizeOutcome,
  ): Promise<TeamRunSnapshot | null> {
    const now = new Date();
    const [run] = await tx
      .update(teamRuns)
      .set({
        status: outcome.status,
        ...(outcome.status === 'failed'
          ? { failureReason: outcome.reason, failureDetail: outcome.detail }
          : {}),
        ...(outcome.status === 'cancelled'
          ? {
              failureReason: 'cancelled' as const,
              ...(outcome.detail ? { failureDetail: outcome.detail } : {}),
            }
          : {}),
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(teamRuns.id, teamRunId),
          eq(teamRuns.status, 'running'),
          outcome.status === 'completed'
            ? isNotNull(teamRuns.result)
            : undefined,
        ),
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
  }

  private async afterFinalize(
    tenantId: string,
    snapshot: TeamRunSnapshot,
    outcome: FinalizeOutcome,
  ): Promise<void> {
    const { run } = snapshot;
    this.logger.log(
      `团队运行 ${run.id} 结束：${outcome.status}${
        outcome.status === 'failed' ? `（${outcome.reason}）` : ''
      }`,
    );

    for (const member of snapshot.members) {
      await this.cancelMember(tenantId, member.conversationId);
    }

    try {
      await this.queue.remove(buildTeamDeadlineJobId(run.id));
    } catch (error) {
      // 截止任务自身触发结束时处于 active（被锁），移除失败无妨：它随后正常完成
      this.logger.debug(
        `移除团队 ${run.id} 截止任务失败：${describeError(error)}`,
      );
    }

    this.emitStatus(tenantId, snapshot);

    if (outcome.status === 'cancelled') {
      return;
    }

    try {
      await this.advanceStep(tenantId, run);
    } catch (error) {
      // 步骤仍为 running：清扫的恢复分支会幂等重做步骤终态与调度
      this.logger.error(
        `团队 ${run.id} 结束后推进步骤 ${run.stepId} 失败，等待清扫恢复：${describeError(error)}`,
      );
    }
  }

  /**
   * 按终态团队推进步骤（幂等）：同一租户事务内校验本运行仍是该步骤的最新运行且步骤仍 running，
   * 再写步骤终态并调度下游——两者同事务提交，失败整体回滚、步骤保持 running 供清扫重做。
   * 返回是否推进了步骤。
   */
  async advanceStep(tenantId: string, run: TeamRun): Promise<boolean> {
    if (run.status !== 'completed' && run.status !== 'failed') {
      return false;
    }
    return runInTenantTransaction(this.db, tenantId, async (tx) => {
      const [latest] = await tx
        .select({ id: teamRuns.id })
        .from(teamRuns)
        .where(eq(teamRuns.stepId, run.stepId))
        .orderBy(desc(teamRuns.createdAt), desc(teamRuns.id))
        .limit(1);
      if (latest?.id !== run.id) {
        this.logger.warn(
          `团队 ${run.id} 已不是步骤 ${run.stepId} 的当前运行，跳过推进步骤`,
        );
        return false;
      }
      const [step] = await tx
        .select({ status: executionSteps.status })
        .from(executionSteps)
        .where(eq(executionSteps.id, run.stepId))
        .for('update');
      if (step?.status !== 'running') {
        return false;
      }

      if (run.status === 'completed') {
        const members = await tx
          .select()
          .from(teamMembers)
          .where(eq(teamMembers.teamRunId, run.id))
          .orderBy(teamMembers.createdAt, teamMembers.id);
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          run.stepId,
          'completed',
          { result: buildTeamStepResult({ run, members }) },
        );
        await this.nodeScheduler.onNodeCompleted(
          run.executionId,
          run.stepId,
          tenantId,
        );
        return true;
      }

      const reason = run.failureReason ?? 'member_failed';
      await this.stepStateMachine.updateStepStatus(
        tenantId,
        run.stepId,
        'failed',
        {
          errorMessage: {
            message: run.failureDetail ?? reason,
            type: `team/${reason}`,
            nodeId: run.nodeId,
          },
        },
      );
      await this.nodeScheduler.onNodeFailed(
        run.executionId,
        run.stepId,
        tenantId,
      );
      return true;
    });
  }

  /** 派发成员对话；失败只记录（桥接监听器同样记录），由清扫重新派发 */
  private async dispatchMember(
    tenantId: string,
    conversationId: string,
  ): Promise<void> {
    try {
      await this.eventEmitter.emitAsync(
        TEAM_MEMBER_CONVERSATION_DISPATCH_EVENT,
        { conversationId, tenantId } satisfies TeamMemberConversationEvent,
      );
    } catch (error) {
      this.logger.warn(
        `派发团队成员对话 ${conversationId} 失败，由清扫重新派发：${describeError(error)}`,
      );
    }
  }

  /** 结束成员对话；失败只记录，由清扫按「终态团队仍有 active 成员对话」重做 */
  private async cancelMember(
    tenantId: string,
    conversationId: string,
  ): Promise<void> {
    try {
      await this.eventEmitter.emitAsync(TEAM_MEMBER_CONVERSATION_CANCEL_EVENT, {
        conversationId,
        tenantId,
      } satisfies TeamMemberConversationEvent);
    } catch (error) {
      this.logger.warn(
        `结束团队成员对话 ${conversationId} 失败，由清扫重做：${describeError(error)}`,
      );
    }
  }

  private async guard(
    label: string,
    operation: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      this.logger.warn(`${label}失败：${describeError(error)}`);
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

/**
 * 结算判定：超出 tokens 预算 → budget_exhausted；有待定结果且 lead 提交回合已落库
 * （lead 最近落库回合不早于提交时间）、或强制、或清扫兜底条件满足 → 完成；否则继续运行。
 */
export function decideSettlement(
  snapshot: TeamRunSnapshot,
  options: TeamSettleOptions,
): FinalizeOutcome | null {
  const { run, members } = snapshot;
  const usedTokens = run.usedInputTokens + run.usedOutputTokens;
  if (usedTokens >= run.budgetMaxTotalTokens) {
    return {
      status: 'failed',
      reason: 'budget_exhausted',
      detail: `已用 ${usedTokens} tokens，超过团队上限 ${run.budgetMaxTotalTokens}`,
    };
  }
  if (run.result === null) {
    return null;
  }
  if (options.force) {
    return { status: 'completed' };
  }
  const lead = members.find((member) => member.isLead);
  const submittedAt = run.resultSubmittedAt;
  if (
    lead?.lastTurnAt &&
    submittedAt &&
    lead.lastTurnAt.getTime() >= submittedAt.getTime()
  ) {
    return { status: 'completed' };
  }
  if (
    options.submittedBefore &&
    submittedAt &&
    submittedAt.getTime() < options.submittedBefore.getTime() &&
    lead?.status !== 'running'
  ) {
    return { status: 'completed' };
  }
  return null;
}

/** assistant 消息 metadata 中某路径的数值；缺失或非数字按 0（路径为代码内常量） */
function usageNumber(path: string): SQL {
  const jsonPath = sql.raw(`'{${path}}'`);
  return sql`CASE WHEN jsonb_typeof(${agentMessages.metadata} #> ${jsonPath}) = 'number' THEN (${agentMessages.metadata} #>> ${jsonPath})::numeric ELSE 0 END`;
}

function sumOf<K extends string>(
  rows: Array<Record<K, number>>,
  key: K,
): number {
  return rows.reduce((total, row) => total + row[key], 0);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
