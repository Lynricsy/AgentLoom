import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentExecutionWorker } from '../agent-execution.worker';

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (dbClient: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

type SelectChain = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

type InsertChain = {
  values: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
};

type UpdateChain = {
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
};

describe('AgentExecutionWorker metadata persistence', () => {
  let selectChain: SelectChain;
  let insertChain: InsertChain;
  let updateChain: UpdateChain;
  let db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let worker: AgentExecutionWorker;
  let workerInternals: any;

  beforeEach(() => {
    selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    };
    insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn(),
    };
    updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    db = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
    };

    worker = new AgentExecutionWorker(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    workerInternals = worker as never;
  });

  it('updateExecutionMetadata 应保留最新 metadata 中的 selfEvolution rememberedPolicies', async () => {
    selectChain.limit.mockResolvedValueOnce([
      {
        metadata: {
          execution: {
            sessionId: 'session-1',
            runningState: 'running',
          },
          selfEvolution: {
            rememberedPolicies: {
              skill_resource_management: 'approve',
            },
          },
        },
      },
    ]);

    const result = await workerInternals.updateExecutionMetadata(
      'tenant-1',
      'conversation-1',
      {
        lastProcessedMessageId: 'message-1',
        runningState: 'idle',
      },
    );

    expect(result).toEqual({
      sessionId: 'session-1',
      lastProcessedMessageId: 'message-1',
      runningState: 'idle',
    });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          execution: {
            sessionId: 'session-1',
            lastProcessedMessageId: 'message-1',
            runningState: 'idle',
          },
          selfEvolution: {
            rememberedPolicies: {
              skill_resource_management: 'approve',
            },
          },
        },
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('persistConversationTurn 应在写入 assistant turn 时保留 selfEvolution rememberedPolicies', async () => {
    selectChain.limit.mockResolvedValueOnce([
      {
        metadata: {
          execution: {
            sessionId: 'session-1',
            runningState: 'running',
          },
          selfEvolution: {
            rememberedPolicies: {
              skill_resource_management: 'approve',
            },
          },
        },
      },
    ]);
    insertChain.returning.mockResolvedValueOnce([{ id: 'assistant-1' }]);

    const result = await workerInternals.persistConversationTurn(
      'conversation-1',
      'tenant-1',
      [
        {
          id: 'message-1',
          content: '继续创建 skill',
          createdAt: new Date('2026-04-02T17:40:00.000Z'),
        },
      ],
      {
        assistantText: '已创建完成',
        decision: undefined,
        stopReason: 'end_turn',
        toolCalls: [],
        toolResults: [],
        segments: [],
      },
      'session-1',
    );

    expect(result).toEqual({
      sessionId: 'session-1',
      lastProcessedMessageId: 'message-1',
      lastAssistantMessageId: 'assistant-1',
      lastStopReason: 'end_turn',
      runningState: 'running',
    });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          execution: {
            sessionId: 'session-1',
            lastProcessedMessageId: 'message-1',
            lastAssistantMessageId: 'assistant-1',
            lastStopReason: 'end_turn',
            runningState: 'running',
          },
          selfEvolution: {
            rememberedPolicies: {
              skill_resource_management: 'approve',
            },
          },
        },
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('被取消的回合已消耗 token 时仍落 assistant 消息（incomplete + usage），用量可被团队汇总', async () => {
    selectChain.limit.mockResolvedValueOnce([
      { metadata: { execution: { sessionId: 'session-1' } } },
    ]);
    insertChain.returning.mockResolvedValueOnce([{ id: 'assistant-1' }]);

    const result = await workerInternals.persistConversationTurn(
      'conversation-1',
      'tenant-1',
      [
        {
          id: 'message-1',
          content: '克隆仓库并修复',
          createdAt: new Date('2026-10-19T17:50:42.000Z'),
        },
      ],
      {
        assistantText: '',
        decision: undefined,
        stopReason: 'cancelled',
        toolCalls: [
          {
            id: 'tool-1',
            tool: 'bash',
            args: {
              command: 'git clone https://github.com/sindresorhus/p-limit',
            },
            status: 'completed',
          },
        ],
        toolResults: [],
        segments: [],
        usageCalls: [{ inputTokens: 8_000, outputTokens: 300 }],
      },
      'session-1',
    );

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        metadata: expect.objectContaining({
          stopReason: 'cancelled',
          incomplete: true,
          usage: expect.objectContaining({
            inputTokens: 8_000,
            outputTokens: 300,
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      lastAssistantMessageId: 'assistant-1',
      lastStopReason: 'cancelled',
    });
  });

  it('被取消且没有任何输出与用量的回合不落 assistant 消息', async () => {
    selectChain.limit.mockResolvedValueOnce([
      { metadata: { execution: { sessionId: 'session-1' } } },
    ]);

    const result = await workerInternals.persistConversationTurn(
      'conversation-1',
      'tenant-1',
      [
        {
          id: 'message-1',
          content: 'hi',
          createdAt: new Date('2026-10-19T17:50:42.000Z'),
        },
      ],
      {
        assistantText: '',
        decision: undefined,
        stopReason: 'cancelled',
        toolCalls: [],
        toolResults: [],
        segments: [],
      },
      'session-1',
    );

    expect(db.insert).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('lastAssistantMessageId');
  });

  it('updateExecutionMetadata 应支持写入并清空失败态元数据', async () => {
    selectChain.limit
      .mockResolvedValueOnce([
        {
          metadata: {
            execution: {
              sessionId: 'session-1',
              runningState: 'running',
            },
            selfEvolution: {
              rememberedPolicies: {
                skill_resource_management: 'approve',
              },
            },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          metadata: {
            execution: {
              sessionId: 'session-1',
              runningState: 'failed',
              errorMessage: '租户未配置默认 LLM 模型',
              failedPhase: 'queued',
            },
            selfEvolution: {
              rememberedPolicies: {
                skill_resource_management: 'approve',
              },
            },
          },
        },
      ]);

    const failedResult = await workerInternals.updateExecutionMetadata(
      'tenant-1',
      'conversation-1',
      {
        runningState: 'failed',
        errorMessage: '租户未配置默认 LLM 模型',
        failedPhase: 'queued',
      },
    );

    expect(failedResult).toEqual({
      sessionId: 'session-1',
      runningState: 'failed',
      errorMessage: '租户未配置默认 LLM 模型',
      failedPhase: 'queued',
    });

    expect(updateChain.set).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        metadata: {
          execution: {
            sessionId: 'session-1',
            runningState: 'failed',
            errorMessage: '租户未配置默认 LLM 模型',
            failedPhase: 'queued',
          },
          selfEvolution: {
            rememberedPolicies: {
              skill_resource_management: 'approve',
            },
          },
        },
        updatedAt: expect.any(Date),
      }),
    );

    const clearedResult = await workerInternals.updateExecutionMetadata(
      'tenant-1',
      'conversation-1',
      {
        runningState: 'idle',
        errorMessage: null,
        failedPhase: null,
      },
    );

    expect(clearedResult).toEqual({
      sessionId: 'session-1',
      runningState: 'idle',
    });

    expect(updateChain.set).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        metadata: {
          execution: {
            sessionId: 'session-1',
            runningState: 'idle',
          },
          selfEvolution: {
            rememberedPolicies: {
              skill_resource_management: 'approve',
            },
          },
        },
        updatedAt: expect.any(Date),
      }),
    );
  });
});
