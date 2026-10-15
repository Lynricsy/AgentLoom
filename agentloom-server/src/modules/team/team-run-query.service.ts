/**
 * 团队运行的只读查询（REST 团队视图）：按执行列出运行、运行详情、消息分页。
 */
import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { agentDefinitions } from '../../database/schema/agent-definitions.schema';
import { teamMembers } from '../../database/schema/team-members.schema';
import { teamMessages } from '../../database/schema/team-messages.schema';
import { teamRuns } from '../../database/schema/team-runs.schema';
import type {
  TeamMessageListResponse,
  TeamRunDetail,
  TeamRunSummary,
} from './dto/team-run.dto';
import { TeamRunNotFoundException } from './team.exceptions';

@Injectable()
export class TeamRunQueryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** 同一步骤恢复重跑会产生多次运行：按创建时间倒序返回全部 */
  async listByExecution(
    tenantId: string,
    executionId: string,
  ): Promise<TeamRunSummary[]> {
    const rows = await runInTenantTransaction(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(teamRuns)
        .where(eq(teamRuns.executionId, executionId))
        .orderBy(desc(teamRuns.createdAt), desc(teamRuns.id)),
    );
    return rows.map((run) => ({
      id: run.id,
      executionId: run.executionId,
      stepId: run.stepId,
      nodeId: run.nodeId,
      status: run.status,
      failureReason: run.failureReason ?? null,
      usage: {
        inputTokens: run.usedInputTokens,
        outputTokens: run.usedOutputTokens,
        costUsd: run.usedCostUsd,
      },
      messageCount: run.messageCount,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
    }));
  }

  async getDetail(tenantId: string, teamRunId: string): Promise<TeamRunDetail> {
    const detail = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [run] = await tx
          .select()
          .from(teamRuns)
          .where(eq(teamRuns.id, teamRunId))
          .limit(1);
        if (!run) {
          return null;
        }
        const members = await tx
          .select({
            member: teamMembers,
            agentName: agentDefinitions.name,
          })
          .from(teamMembers)
          .leftJoin(
            agentDefinitions,
            eq(agentDefinitions.id, teamMembers.agentDefinitionId),
          )
          .where(eq(teamMembers.teamRunId, teamRunId))
          .orderBy(asc(teamMembers.createdAt), asc(teamMembers.id));
        return { run, members };
      },
    );
    if (!detail) {
      throw new TeamRunNotFoundException(teamRunId);
    }

    const { run, members } = detail;
    return {
      id: run.id,
      executionId: run.executionId,
      stepId: run.stepId,
      nodeId: run.nodeId,
      status: run.status,
      taskText: run.taskText,
      budget: {
        maxTotalTokens: run.budgetMaxTotalTokens,
        maxMessages: run.budgetMaxMessages,
        deadlineAt: run.deadlineAt.toISOString(),
        usedTokens: run.usedInputTokens + run.usedOutputTokens,
        messageCount: run.messageCount,
      },
      usage: {
        inputTokens: run.usedInputTokens,
        outputTokens: run.usedOutputTokens,
        costUsd: run.usedCostUsd,
      },
      members: members.map(({ member, agentName }) => ({
        id: member.id,
        role: member.role,
        isLead: member.isLead,
        agentDefinitionId: member.agentDefinitionId,
        agentName: agentName ?? null,
        conversationId: member.conversationId,
        status: member.status,
        turnCount: member.turnCount,
        usage: {
          inputTokens: member.usedInputTokens,
          outputTokens: member.usedOutputTokens,
          costUsd: member.usedCostUsd,
        },
      })),
      result: run.result ?? null,
      failureReason: run.failureReason ?? null,
      failureDetail: run.failureDetail ?? null,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    };
  }

  async listMessages(
    tenantId: string,
    teamRunId: string,
    page: number,
    limit: number,
  ): Promise<TeamMessageListResponse> {
    const sender = alias(teamMembers, 'sender');
    const recipient = alias(teamMembers, 'recipient');

    const result = await runInTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [run] = await tx
          .select({ id: teamRuns.id })
          .from(teamRuns)
          .where(eq(teamRuns.id, teamRunId))
          .limit(1);
        if (!run) {
          return null;
        }
        const [{ total }] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(teamMessages)
          .where(eq(teamMessages.teamRunId, teamRunId));
        const rows = await tx
          .select({
            id: teamMessages.id,
            kind: teamMessages.kind,
            content: teamMessages.content,
            refs: teamMessages.refs,
            deliveryStatus: teamMessages.deliveryStatus,
            decisionRecordId: teamMessages.decisionRecordId,
            createdAt: teamMessages.createdAt,
            deliveredAt: teamMessages.deliveredAt,
            consumedAt: teamMessages.consumedAt,
            fromRole: sender.role,
            toRole: recipient.role,
          })
          .from(teamMessages)
          .leftJoin(sender, eq(sender.id, teamMessages.senderMemberId))
          .innerJoin(
            recipient,
            eq(recipient.id, teamMessages.recipientMemberId),
          )
          .where(eq(teamMessages.teamRunId, teamRunId))
          .orderBy(asc(teamMessages.createdAt), asc(teamMessages.id))
          .limit(limit)
          .offset((page - 1) * limit);
        return { total, rows };
      },
    );
    if (!result) {
      throw new TeamRunNotFoundException(teamRunId);
    }

    return {
      data: result.rows.map((row) => ({
        id: row.id,
        fromRole: row.fromRole ?? null,
        toRole: row.toRole,
        kind: row.kind,
        content: row.content,
        refs: row.refs,
        deliveryStatus: row.deliveryStatus,
        decisionRecordId: row.decisionRecordId ?? null,
        createdAt: row.createdAt.toISOString(),
        deliveredAt: row.deliveredAt?.toISOString() ?? null,
        consumedAt: row.consumedAt?.toISOString() ?? null,
      })),
      meta: {
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  }
}
