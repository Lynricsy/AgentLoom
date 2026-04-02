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
});
