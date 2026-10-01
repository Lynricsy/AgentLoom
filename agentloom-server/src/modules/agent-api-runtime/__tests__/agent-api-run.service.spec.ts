import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentApiRunService } from '../agent-api-run.service';
import {
  AGENT_API_RUN_WORKER_LOST_ERROR,
  buildAgentApiRunFailedError,
} from '../agent-api-runtime.constants';

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (dbClient: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

const TENANT_ID = '01900000-0000-7000-8000-0000000000aa';
const CONVERSATION_ID = '01900000-0000-7000-8000-0000000000c1';
const RUN_ID = '01900000-0000-7000-8000-000000000001';
const USER_MESSAGE_ID = '01900000-0000-7000-8000-0000000000e1';
const ASSISTANT_MESSAGE_ID = '01900000-0000-7000-8000-0000000000e2';

function renderWhere(where: SQL) {
  return new PgDialect().sqlToQuery(where);
}

function createUpdateChain(rows: Array<{ id: string }>) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

function createSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    conversationId: CONVERSATION_ID,
    status: 'completed',
    agentVersionId: null,
    userMessageId: USER_MESSAGE_ID,
    assistantMessageId: ASSISTANT_MESSAGE_ID,
    stopReason: 'end_turn',
    error: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    startedAt: new Date('2026-10-01T00:00:01.000Z'),
    completedAt: new Date('2026-10-01T00:00:05.000Z'),
    inputContent: '你好',
    outputContent: '你好！',
    outputToolCalls: null,
    ...overrides,
  };
}

describe('AgentApiRunService', () => {
  const db = { update: vi.fn(), select: vi.fn() };
  const eventStream = {
    append: vi.fn(),
    expire: vi.fn(),
  };
  let service: AgentApiRunService;

  beforeEach(() => {
    vi.clearAllMocks();
    eventStream.append.mockResolvedValue('1-0');
    eventStream.expire.mockResolvedValue(undefined);
    service = new AgentApiRunService(db as never, eventStream as never);
  });

  describe('markRunning()', () => {
    it('命中 queued run 时标记 running、登记对话并写入 run.status', async () => {
      const update = createUpdateChain([{ id: RUN_ID }]);
      db.update.mockReturnValue(update);

      const runId = await service.markRunning({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        pendingMessageIds: [USER_MESSAGE_ID],
        agentVersionId: 'version-1',
      });

      expect(runId).toBe(RUN_ID);
      expect(update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          agentVersionId: 'version-1',
        }),
      );
      expect(renderWhere(update.where.mock.calls[0][0]).params).toEqual([
        USER_MESSAGE_ID,
        'queued',
      ]);
      expect(service.getLocalRunId(CONVERSATION_ID)).toBe(RUN_ID);
      expect(eventStream.append).toHaveBeenCalledWith(RUN_ID, {
        event: 'run.status',
        data: { runId: RUN_ID, status: 'running' },
      });
    });

    it('没有 queued run（Studio 对话）时不登记也不写事件', async () => {
      db.update.mockReturnValue(createUpdateChain([]));

      const runId = await service.markRunning({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        pendingMessageIds: [USER_MESSAGE_ID],
        agentVersionId: null,
      });

      expect(runId).toBeNull();
      expect(service.getLocalRunId(CONVERSATION_ID)).toBeUndefined();
      expect(eventStream.append).not.toHaveBeenCalled();
    });

    it('事件流写入失败不影响 running 标记', async () => {
      db.update.mockReturnValue(createUpdateChain([{ id: RUN_ID }]));
      eventStream.append.mockRejectedValue(new Error('redis down'));

      await expect(
        service.markRunning({
          tenantId: TENANT_ID,
          conversationId: CONVERSATION_ID,
          pendingMessageIds: [USER_MESSAGE_ID],
          agentVersionId: null,
        }),
      ).resolves.toBe(RUN_ID);
    });
  });

  describe('finalizeTurnInTransaction()', () => {
    it.each([
      {
        name: 'stopReason=cancelled 优先于 failure',
        stopReason: 'cancelled',
        failure: buildAgentApiRunFailedError('boom'),
        expected: { status: 'cancelled', error: null },
      },
      {
        name: '有 failure 时为 failed',
        stopReason: 'end_turn',
        failure: buildAgentApiRunFailedError('boom'),
        expected: {
          status: 'failed',
          error: buildAgentApiRunFailedError('boom'),
        },
      },
      {
        name: '正常结束为 completed',
        stopReason: 'end_turn',
        failure: undefined,
        expected: { status: 'completed', error: null },
      },
    ])('$name', async ({ stopReason, failure, expected }) => {
      const update = createUpdateChain([{ id: RUN_ID }]);
      db.update.mockReturnValue(update);

      const runIds = await service.finalizeTurnInTransaction(db as never, {
        conversationId: CONVERSATION_ID,
        pendingMessageIds: [USER_MESSAGE_ID],
        assistantMessageId: null,
        stopReason,
        failure,
      });

      expect(runIds).toEqual([RUN_ID]);
      expect(update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          ...expected,
          assistantMessageId: null,
          stopReason,
        }),
      );
    });

    it('只更新本轮消息对应且仍处于 queued/running 的 run', async () => {
      const update = createUpdateChain([]);
      db.update.mockReturnValue(update);

      await service.finalizeTurnInTransaction(db as never, {
        conversationId: CONVERSATION_ID,
        pendingMessageIds: [USER_MESSAGE_ID, 'message-2'],
        assistantMessageId: ASSISTANT_MESSAGE_ID,
        stopReason: 'end_turn',
      });

      const { sql, params } = renderWhere(update.where.mock.calls[0][0]);
      expect(sql).toContain('"user_message_id" in ($2, $3)');
      expect(sql).toContain('"status" in ($4, $5)');
      expect(params).toEqual([
        CONVERSATION_ID,
        USER_MESSAGE_ID,
        'message-2',
        'queued',
        'running',
      ]);
    });

    it('没有待处理消息时不访问数据库', async () => {
      await expect(
        service.finalizeTurnInTransaction(db as never, {
          conversationId: CONVERSATION_ID,
          pendingMessageIds: [],
          assistantMessageId: null,
          stopReason: 'end_turn',
        }),
      ).resolves.toEqual([]);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('publishTerminal()', () => {
    it('按终态写入对应事件名与契约形状的 run，设置过期并解除登记', async () => {
      const failedRunId = '01900000-0000-7000-8000-000000000002';
      const cancelledRunId = '01900000-0000-7000-8000-000000000003';
      db.select.mockReturnValue(
        createSelectChain([
          runRow({
            id: cancelledRunId,
            status: 'cancelled',
            assistantMessageId: null,
            outputContent: null,
            stopReason: 'cancelled',
          }),
          runRow({
            outputToolCalls: [
              {
                id: 'call-1',
                tool: 'web_search',
                status: 'completed',
                args: { query: 'secret' },
                result: { body: 'internal' },
              },
            ],
          }),
          runRow({
            id: failedRunId,
            status: 'failed',
            stopReason: 'tool_use',
            error: buildAgentApiRunFailedError('boom'),
          }),
        ]),
      );
      service.registerLocalRun(CONVERSATION_ID, RUN_ID);

      await service.publishTerminal(TENANT_ID, [
        RUN_ID,
        failedRunId,
        cancelledRunId,
      ]);

      expect(
        eventStream.append.mock.calls.map(([runId, event]) => [
          runId,
          event.event,
        ]),
      ).toEqual([
        [RUN_ID, 'run.completed'],
        [failedRunId, 'run.failed'],
        [cancelledRunId, 'run.cancelled'],
      ]);
      expect(eventStream.append.mock.calls[0][1].data.run).toEqual({
        id: RUN_ID,
        conversationId: CONVERSATION_ID,
        status: 'completed',
        agentVersionId: null,
        input: { messageId: USER_MESSAGE_ID, content: '你好' },
        output: {
          messageId: ASSISTANT_MESSAGE_ID,
          content: '你好！',
          toolCalls: [{ id: 'call-1', tool: 'web_search', status: 'completed' }],
        },
        stopReason: 'end_turn',
        error: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        startedAt: '2026-10-01T00:00:01.000Z',
        completedAt: '2026-10-01T00:00:05.000Z',
      });
      expect(eventStream.append.mock.calls[1][1].data.run).toMatchObject({
        stopReason: null,
        error: buildAgentApiRunFailedError('boom'),
      });
      expect(eventStream.append.mock.calls[2][1].data.run.output).toBeNull();
      expect(eventStream.expire.mock.calls.map(([runId]) => runId)).toEqual([
        RUN_ID,
        failedRunId,
        cancelledRunId,
      ]);
      expect(service.getLocalRunId(CONVERSATION_ID)).toBeUndefined();
    });

    it('仍在运行的 run 不发布终态事件', async () => {
      db.select.mockReturnValue(
        createSelectChain([runRow({ status: 'running' })]),
      );

      await service.publishTerminal(TENANT_ID, [RUN_ID]);

      expect(eventStream.append).not.toHaveBeenCalled();
      expect(eventStream.expire).not.toHaveBeenCalled();
    });
  });

  describe('failActiveRuns()', () => {
    it('把对话的活跃 run 标记为 failed 并发布 run.failed', async () => {
      const update = createUpdateChain([{ id: RUN_ID }]);
      db.update.mockReturnValue(update);
      db.select.mockReturnValue(
        createSelectChain([
          runRow({
            status: 'failed',
            assistantMessageId: null,
            outputContent: null,
            stopReason: null,
            error: AGENT_API_RUN_WORKER_LOST_ERROR,
          }),
        ]),
      );

      await service.failActiveRuns({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        error: AGENT_API_RUN_WORKER_LOST_ERROR,
      });

      expect(update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: AGENT_API_RUN_WORKER_LOST_ERROR,
        }),
      );
      expect(renderWhere(update.where.mock.calls[0][0]).params).toEqual([
        CONVERSATION_ID,
        'queued',
        'running',
      ]);
      expect(eventStream.append).toHaveBeenCalledWith(
        RUN_ID,
        expect.objectContaining({ event: 'run.failed' }),
      );
    });

    it('没有活跃 run 时不发布事件', async () => {
      db.update.mockReturnValue(createUpdateChain([]));

      await service.failActiveRuns({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        error: AGENT_API_RUN_WORKER_LOST_ERROR,
      });

      expect(db.select).not.toHaveBeenCalled();
      expect(eventStream.append).not.toHaveBeenCalled();
    });
  });
});
