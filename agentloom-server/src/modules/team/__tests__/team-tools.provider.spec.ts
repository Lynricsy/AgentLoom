import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolSet } from 'ai';

import { TeamToolsProvider } from '../team-tools.provider';
import type { TeamMemberContext } from '../team.types';

const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const RUN_ID = '019577a0-0000-7000-8000-000000000003';

const members = [
  {
    id: 'member-locator',
    role: 'locator',
    isLead: false,
    status: 'idle',
    conversationId: 'conversation-locator',
    instructions: '定位',
  },
  {
    id: 'member-implementer',
    role: 'implementer',
    isLead: true,
    status: 'idle',
    conversationId: 'conversation-implementer',
    instructions: '实现',
  },
  {
    id: 'member-verifier',
    role: 'verifier',
    isLead: false,
    status: 'running',
    conversationId: 'conversation-verifier',
    instructions: '验证',
  },
];

const run = {
  id: RUN_ID,
  status: 'running',
  budgetMaxMessages: 5,
  budgetMaxTotalTokens: 1000,
  usedInputTokens: 1,
  usedOutputTokens: 2,
  messageCount: 0,
  deadlineAt: new Date('2026-01-01T00:00:00Z'),
};

function memberContext(
  overrides: Partial<TeamMemberContext> = {},
): TeamMemberContext {
  return {
    tenantId: TENANT_ID,
    teamRunId: RUN_ID,
    executionId: 'execution-1',
    stepId: 'step-1',
    memberId: 'member-locator',
    conversationId: 'conversation-locator',
    role: 'locator',
    isLead: false,
    canMessage: ['implementer'],
    instructions: '定位',
    outputSchema: null,
    ...overrides,
  };
}

function setup() {
  const mailbox = {
    findMemberByConversation: vi.fn(),
    send: vi.fn().mockResolvedValue({ ok: true, messageIds: ['m-1'] }),
    loadRecentAssistantOutput: vi.fn().mockResolvedValue('最近输出'),
    countUnreadByRecipient: vi
      .fn()
      .mockResolvedValue({ 'member-implementer': 2 }),
  };
  const teamRunService = {
    loadSnapshot: vi.fn().mockResolvedValue({ run, members }),
    fail: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    incrementSchemaInvalid: vi.fn(),
  };
  const decisionService = {
    decide: vi.fn().mockResolvedValue({
      outcome: { type: 'noul', value: 1 },
      recordId: 'decision-1',
    }),
  };
  const provider = new TeamToolsProvider(
    mailbox as never,
    teamRunService as never,
    decisionService as never,
  );
  return { provider, mailbox, teamRunService, decisionService };
}

async function tools(
  provider: TeamToolsProvider,
  member: TeamMemberContext,
): Promise<ToolSet> {
  return provider.createSessionToolProvider(member)();
}

async function call(
  toolSet: ToolSet,
  name: string,
  input: unknown,
): Promise<unknown> {
  const execute = toolSet[name]?.execute;
  if (!execute) {
    throw new Error(`工具 ${name} 未注册`);
  }
  return execute(
    input as never,
    {
      toolCallId: 'call-1',
      messages: [],
    } as never,
  );
}

describe('TeamToolsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('通信矩阵允许的接收者直接投递', async () => {
    const { provider, mailbox, decisionService } = setup();
    const toolSet = await tools(provider, memberContext());

    const result = await call(toolSet, 'team_send_message', {
      to: 'implementer',
      kind: 'request',
      content: '请看 auth.ts',
    });

    expect(JSON.parse(result as string)).toEqual({
      messageIds: ['m-1'],
      deliveredTo: ['implementer'],
      suppressedTo: [],
    });
    expect(mailbox.send).toHaveBeenCalledWith(
      expect.objectContaining({
        senderMemberId: 'member-locator',
        recipients: [{ memberId: 'member-implementer' }],
        kind: 'request',
      }),
    );
    expect(decisionService.decide).not.toHaveBeenCalled();
  });

  it('通信矩阵不允许的接收者返回错误文本', async () => {
    const { provider, mailbox } = setup();
    const toolSet = await tools(provider, memberContext());

    const result = await call(toolSet, 'team_send_message', {
      to: 'verifier',
      kind: 'request',
      content: '请验证',
    });

    expect(result).toBe('错误：角色 locator 无权向 verifier 发送消息');
    expect(mailbox.send).not.toHaveBeenCalled();
  });

  it('广播需要 canMessage 含 "*"', async () => {
    const { provider, mailbox } = setup();
    const toolSet = await tools(provider, memberContext());

    const result = await call(toolSet, 'team_send_message', {
      to: '*',
      kind: 'observation',
      content: '发现',
    });

    expect(result).toBe('错误：角色 locator 无权广播消息');
    expect(mailbox.send).not.toHaveBeenCalled();
  });

  it('广播 observation 逐个接收者做相关性决策并记录决策 id', async () => {
    const { provider, mailbox, decisionService } = setup();
    const toolSet = await tools(provider, memberContext({ canMessage: ['*'] }));

    await call(toolSet, 'team_send_message', {
      to: '*',
      kind: 'observation',
      content: '发现',
      refs: ['a.ts'],
    });

    expect(decisionService.decide).toHaveBeenCalledTimes(2);
    expect(decisionService.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'team.message_relevance',
        tenantId: TENANT_ID,
        subject: { type: 'team_message', id: expect.any(String) },
        input: {
          recipient: {
            role: 'implementer',
            instructions: '实现',
            recentOutput: '最近输出',
          },
          message: {
            fromRole: 'locator',
            kind: 'observation',
            content: '发现',
            refs: ['a.ts'],
          },
        },
      }),
    );
    const recipients = mailbox.send.mock.calls[0][0].recipients;
    expect(recipients).toHaveLength(2);
    expect(recipients[0]).toMatchObject({
      memberId: 'member-implementer',
      decisionRecordId: 'decision-1',
    });
    expect(recipients[0].messageId).toBe(
      decisionService.decide.mock.calls[0][0].subject.id,
    );
  });

  it('消息预算耗尽时返回错误并使团队失败', async () => {
    const { provider, mailbox, teamRunService } = setup();
    mailbox.send.mockResolvedValue({ ok: false, reason: 'budget_exhausted' });
    const toolSet = await tools(provider, memberContext());

    const result = await call(toolSet, 'team_send_message', {
      to: 'implementer',
      kind: 'reply',
      content: '回复',
    });

    expect(result).toBe('错误：消息预算已耗尽');
    expect(teamRunService.fail).toHaveBeenCalledWith(
      TENANT_ID,
      RUN_ID,
      'budget_exhausted',
      expect.any(String),
    );
  });

  it('只有 lead 拥有 team_submit_result', async () => {
    const { provider } = setup();

    expect(Object.keys(await tools(provider, memberContext()))).toEqual([
      'team_send_message',
      'team_get_status',
    ]);
    expect(
      Object.keys(
        await tools(
          provider,
          memberContext({ isLead: true, role: 'implementer' }),
        ),
      ),
    ).toContain('team_submit_result');
  });

  it('team_get_status 返回成员状态、未读数与预算', async () => {
    const { provider } = setup();
    const toolSet = await tools(provider, memberContext());

    const status = JSON.parse(
      (await call(toolSet, 'team_get_status', {})) as string,
    );

    expect(status.members[1]).toEqual({
      role: 'implementer',
      isLead: true,
      status: 'idle',
      unreadCount: 2,
    });
    expect(status.budget).toMatchObject({ usedTokens: 3, maxMessages: 5 });
    expect(status.submitted).toBe(false);
  });

  describe('team_submit_result', () => {
    const lead = memberContext({
      memberId: 'member-implementer',
      role: 'implementer',
      isLead: true,
      canMessage: ['*'],
      outputSchema: {
        type: 'object',
        properties: { patch: { type: 'string' } },
        required: ['patch'],
      },
    });

    it('产物符合 Schema 时完成团队', async () => {
      const { provider, teamRunService } = setup();
      const toolSet = await tools(provider, lead);

      const result = await call(toolSet, 'team_submit_result', {
        summary: '已修复',
        artifact: { patch: 'diff' },
      });

      expect(result).toBe('已提交，团队任务结束');
      expect(teamRunService.complete).toHaveBeenCalledWith(TENANT_ID, RUN_ID, {
        summary: '已修复',
        artifact: { patch: 'diff' },
      });
    });

    it('不符合 Schema 时计数，第三次失败使团队失败', async () => {
      const { provider, teamRunService } = setup();
      const toolSet = await tools(provider, lead);

      teamRunService.incrementSchemaInvalid.mockResolvedValueOnce(1);
      const first = await call(toolSet, 'team_submit_result', {
        summary: '结果',
        artifact: { wrong: true },
      });
      expect(first).toMatch(/^错误：产物不符合输出 Schema（第 1\/3 次）/);
      expect(teamRunService.fail).not.toHaveBeenCalled();

      teamRunService.incrementSchemaInvalid.mockResolvedValueOnce(3);
      const third = await call(toolSet, 'team_submit_result', {
        summary: '结果',
        artifact: { wrong: true },
      });
      expect(third).toBe('错误：产物连续 3 次不符合输出 Schema，团队任务失败');
      expect(teamRunService.fail).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        'schema_invalid',
        expect.any(String),
      );
      expect(teamRunService.complete).not.toHaveBeenCalled();
    });
  });
});
