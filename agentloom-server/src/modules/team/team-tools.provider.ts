/**
 * 团队成员会话工具：team_send_message、team_get_status，以及仅 lead 拥有的 team_submit_result。
 * 工具返回字符串，越权与预算错误以「错误：…」文本返回给模型，不抛出。
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { TEAM_BROADCAST_TARGET } from '@agentloom/contracts';

import type { SessionToolProvider } from '../agent/ports/agent-runtime.port';
import { DecisionService } from '../decision/decision.service';
import { parseAgentStructuredOutput } from '../execution/agent-structured-output.util';
import { TeamMailboxService } from './team-mailbox.service';
import { TeamRunService } from './team-run.service';
import {
  TEAM_MAX_SCHEMA_INVALID,
  TEAM_MESSAGE_CONTENT_MAX,
} from './team.constants';
import { TeamMemberNotAllowedException } from './team.exceptions';
import type { TeamMemberContext, TeamMessageRecipient } from './team.types';

export const TeamSendMessageInputSchema = z.object({
  to: z
    .string()
    .describe('接收者角色名；有广播权限时可用 "*" 发给其他全部成员'),
  kind: z
    .enum(['observation', 'request', 'reply', 'artifact'])
    .describe('observation=发现，request=请求，reply=回复，artifact=产物'),
  content: z.string().min(1).max(TEAM_MESSAGE_CONTENT_MAX),
  refs: z
    .array(z.string().max(500))
    .max(20)
    .optional()
    .describe('引用：文件路径、命令、消息 id 等'),
  replyToMessageId: z.string().uuid().optional(),
});

export const TeamSubmitResultInputSchema = z.object({
  summary: z.string().min(1).max(TEAM_MESSAGE_CONTENT_MAX),
  artifact: z
    .unknown()
    .optional()
    .describe('结构化产物；节点配置了输出 Schema 时必须符合该 Schema'),
  knownLimitations: z.array(z.string().max(1000)).max(50).optional(),
});

type TeamSendMessageInput = z.infer<typeof TeamSendMessageInputSchema>;
type TeamSubmitResultInput = z.infer<typeof TeamSubmitResultInputSchema>;

@Injectable()
export class TeamToolsProvider {
  constructor(
    private readonly mailbox: TeamMailboxService,
    private readonly teamRunService: TeamRunService,
    private readonly decisionService: DecisionService,
  ) {}

  /** 成员对话的会话工具；对话不属于任何团队时返回 null */
  async createForConversation(
    conversationId: string,
    tenantId: string,
  ): Promise<SessionToolProvider | null> {
    const member = await this.mailbox.findMemberByConversation(
      conversationId,
      tenantId,
    );
    return member ? this.createSessionToolProvider(member) : null;
  }

  createSessionToolProvider(member: TeamMemberContext): SessionToolProvider {
    return (): ToolSet => ({
      team_send_message: tool({
        description:
          '向团队成员发送消息（发现、请求、回复或产物）。消息在接收者当前回合结束后送达；只能发给你有权通信的角色。',
        inputSchema: TeamSendMessageInputSchema,
        execute: async (input) => this.sendMessage(member, input),
      }),
      team_get_status: tool({
        description: '查看团队成员状态、未读消息数与预算使用情况。',
        inputSchema: z.object({}),
        execute: async () => this.getStatus(member),
      }),
      ...(member.isLead
        ? {
            team_submit_result: tool({
              description:
                '负责人提交团队最终结果，团队任务随即结束。summary 必填；节点配置了输出 Schema 时 artifact 必须符合。',
              inputSchema: TeamSubmitResultInputSchema,
              execute: async (input) => this.submitResult(member, input),
            }),
          }
        : {}),
    });
  }

  private async sendMessage(
    member: TeamMemberContext,
    input: TeamSendMessageInput,
  ): Promise<string> {
    const snapshot = await this.teamRunService.loadSnapshot(
      member.tenantId,
      member.teamRunId,
    );
    if (!snapshot || snapshot.run.status !== 'running') {
      return '错误：团队任务已结束';
    }

    let recipients: typeof snapshot.members;
    try {
      recipients = resolveRecipients(member, input.to, snapshot.members);
    } catch (error) {
      if (error instanceof TeamMemberNotAllowedException) {
        return `错误：${error.detail}`;
      }
      throw error;
    }

    const planned: TeamMessageRecipient[] = [];
    if (input.kind === 'observation' && input.to === TEAM_BROADCAST_TARGET) {
      // 广播发现逐个接收者做相关性决策；规则结果恒为投递，决策记录供影子评估对照
      for (const recipient of recipients) {
        const messageId = randomUUID();
        const decision = await this.decisionService.decide({
          kind: 'team.message_relevance',
          tenantId: member.tenantId,
          subject: { type: 'team_message', id: messageId },
          input: {
            recipient: {
              role: recipient.role,
              instructions: recipient.instructions ?? '',
              recentOutput: await this.mailbox.loadRecentAssistantOutput(
                member.tenantId,
                recipient.conversationId,
              ),
            },
            message: {
              fromRole: member.role,
              kind: input.kind,
              content: input.content,
              refs: input.refs ?? [],
            },
          },
        });
        planned.push({
          memberId: recipient.id,
          messageId,
          decisionRecordId: decision.recordId,
        });
      }
    } else {
      planned.push(
        ...recipients.map((recipient) => ({ memberId: recipient.id })),
      );
    }

    const result = await this.mailbox.send({
      tenantId: member.tenantId,
      teamRunId: member.teamRunId,
      senderMemberId: member.memberId,
      recipients: planned,
      kind: input.kind,
      content: input.content,
      refs: input.refs,
      replyToMessageId: input.replyToMessageId,
    });

    if (!result.ok) {
      if (result.reason === 'run_not_running') {
        return '错误：团队任务已结束';
      }
      await this.teamRunService.fail(
        member.tenantId,
        member.teamRunId,
        'budget_exhausted',
        `消息数达到团队上限 ${snapshot.run.budgetMaxMessages}`,
      );
      return '错误：消息预算已耗尽';
    }

    return JSON.stringify({
      messageIds: result.messageIds,
      deliveredTo: recipients.map((recipient) => recipient.role),
      suppressedTo: [],
    });
  }

  private async getStatus(member: TeamMemberContext): Promise<string> {
    const snapshot = await this.teamRunService.loadSnapshot(
      member.tenantId,
      member.teamRunId,
    );
    if (!snapshot) {
      return '错误：团队运行不存在';
    }
    const unread = await this.mailbox.countUnreadByRecipient(
      member.tenantId,
      member.teamRunId,
    );
    const { run, members } = snapshot;
    return JSON.stringify({
      teamRunId: run.id,
      status: run.status,
      members: members.map((teammate) => ({
        role: teammate.role,
        isLead: teammate.isLead,
        status: teammate.status,
        unreadCount: unread[teammate.id] ?? 0,
      })),
      budget: {
        usedTokens: run.usedInputTokens + run.usedOutputTokens,
        maxTotalTokens: run.budgetMaxTotalTokens,
        messageCount: run.messageCount,
        maxMessages: run.budgetMaxMessages,
        deadlineAt: run.deadlineAt.toISOString(),
      },
      submitted: run.status === 'completed',
    });
  }

  private async submitResult(
    member: TeamMemberContext,
    input: TeamSubmitResultInput,
  ): Promise<string> {
    let artifact = input.artifact;
    if (member.outputSchema) {
      try {
        artifact = parseAgentStructuredOutput(
          input.artifact ?? null,
          member.outputSchema,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const count = await this.teamRunService.incrementSchemaInvalid(
          member.tenantId,
          member.teamRunId,
        );
        if (count === null) {
          return '错误：团队任务已结束';
        }
        if (count >= TEAM_MAX_SCHEMA_INVALID) {
          await this.teamRunService.fail(
            member.tenantId,
            member.teamRunId,
            'schema_invalid',
            message,
          );
          return `错误：产物连续 ${count} 次不符合输出 Schema，团队任务失败`;
        }
        return `错误：产物不符合输出 Schema（第 ${count}/${TEAM_MAX_SCHEMA_INVALID} 次）：${message}`;
      }
    }

    const completed = await this.teamRunService.complete(
      member.tenantId,
      member.teamRunId,
      {
        summary: input.summary,
        ...(artifact !== undefined ? { artifact } : {}),
        ...(input.knownLimitations
          ? { knownLimitations: input.knownLimitations }
          : {}),
      },
    );
    return completed ? '已提交，团队任务结束' : '错误：团队任务已结束';
  }
}

/** 按通信矩阵解析接收者；越权或角色不存在抛 TeamMemberNotAllowedException */
export function resolveRecipients<T extends { id: string; role: string }>(
  member: Pick<TeamMemberContext, 'memberId' | 'role' | 'canMessage'>,
  to: string,
  members: T[],
): T[] {
  const canBroadcast = member.canMessage.includes(TEAM_BROADCAST_TARGET);
  if (to === TEAM_BROADCAST_TARGET) {
    if (!canBroadcast) {
      throw new TeamMemberNotAllowedException(
        `角色 ${member.role} 无权广播消息`,
      );
    }
    return members.filter((teammate) => teammate.id !== member.memberId);
  }

  const recipient = members.find((teammate) => teammate.role === to);
  if (
    !recipient ||
    recipient.id === member.memberId ||
    !(canBroadcast || member.canMessage.includes(to))
  ) {
    throw new TeamMemberNotAllowedException(
      `角色 ${member.role} 无权向 ${to} 发送消息`,
    );
  }
  return [recipient];
}
