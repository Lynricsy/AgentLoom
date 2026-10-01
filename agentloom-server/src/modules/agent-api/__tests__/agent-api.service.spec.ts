import type { AgentApiRun } from '@agentloom/contracts';
import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as TenantTransactionContext from '../../../common/interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../../database/database.module';
import type {
  AgentApiStreamBounds,
  AgentApiStreamEntry,
} from '../../agent-api-runtime/agent-api-event-stream.service';
import type { AgentApiKeyContext } from '../agent-api.types';
import { AgentApiService } from '../agent-api.service';

vi.mock(
  '../../../common/interceptors/tenant-transaction.context',
  async (importOriginal) => ({
    ...(await importOriginal<typeof TenantTransactionContext>()),
    runInTenantTransaction: vi.fn(
      async (
        db: unknown,
        _tenantId: string,
        operation: (dbClient: unknown) => Promise<unknown>,
      ) => operation(db),
    ),
  }),
);

const TENANT_ID = '019391d4-a000-7000-8000-000000000001';
const AGENT_ID = '019391d4-c000-7000-8000-000000000003';
const KEY_ID = '019391d4-d000-7000-8000-000000000004';
const CONVERSATION_ID = '019391d4-e000-7000-8000-000000000005';
const OTHER_CONVERSATION_ID = '019391d4-e000-7000-8000-000000000006';
const RUN_ID = '019391d4-f000-7000-8000-000000000007';
const MESSAGE_ID = '019391d4-f000-7000-8000-000000000008';
const VERSION_ID = '019391d4-f000-7000-8000-000000000009';
const NOW = new Date('2026-10-01T08:00:00.000Z');

const KEY: AgentApiKeyContext = {
  keyId: KEY_ID,
  tenantId: TENANT_ID,
  agentDefinitionId: AGENT_ID,
  keyPrefix: 'alak_1a2b3c4d',
  maxConcurrentRuns: 2,
  rateLimitPerMinute: null,
};

type Operation = {
  kind: 'select' | 'insert' | 'update';
  values?: Record<string, unknown>;
};

type QueryResult = unknown[] | ((operation: Operation) => unknown[]);

/**
 * 链式 Drizzle 查询替身：每条查询被 await 时按顺序消费一份预置结果，
 * 并记录 insert 写入的内容供断言。
 */
function createDbMock(results: QueryResult[]) {
  const operations: Operation[] = [];

  function chain(operation: Operation) {
    operations.push(operation);
    const builder: Record<string, unknown> = {};
    for (const method of [
      'from',
      'where',
      'limit',
      'offset',
      'orderBy',
      'for',
      'leftJoin',
      'innerJoin',
      'returning',
      'set',
    ]) {
      builder[method] = () => builder;
    }
    builder.values = (values: Record<string, unknown>) => {
      operation.values = values;
      return builder;
    };
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => {
      const next = results.shift() ?? [];
      return Promise.resolve(
        typeof next === 'function' ? next(operation) : next,
      ).then(resolve, reject);
    };
    return builder;
  }

  const db = {
    select: vi.fn(() => chain({ kind: 'select' })),
    insert: vi.fn(() => chain({ kind: 'insert' })),
    update: vi.fn(() => chain({ kind: 'update' })),
  };

  return { db: db as unknown as DrizzleDB, operations };
}

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    agentDefinitionId: AGENT_ID,
    tenantId: TENANT_ID,
    title: null,
    status: 'active',
    metadata: {},
    createdBy: null,
    source: 'api',
    apiKeyId: KEY_ID,
    externalUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function runDto(overrides: Partial<AgentApiRun> = {}): AgentApiRun {
  return {
    id: RUN_ID,
    conversationId: CONVERSATION_ID,
    status: 'queued',
    agentVersionId: null,
    input: { messageId: MESSAGE_ID, content: '我的订单还没发货' },
    output: null,
    stopReason: null,
    error: null,
    createdAt: NOW.toISOString(),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

const PUBLISHED_AGENT = [{ status: 'published', publishedVersionId: VERSION_ID }];
const RUN_BODY = { input: { content: '我的订单还没发货' } };

/**
 * 新建 run 的查询结果，按发出顺序：
 * [事务外幂等查询]、对话、Agent、锁 Key、[持锁幂等复查]、Key 活跃计数、对话活跃 run、插入 run。
 */
function freshRunQueries(
  options: { activeRuns?: number; idempotent?: boolean } = {},
): QueryResult[] {
  return [
    ...(options.idempotent ? [[]] : []),
    [conversationRow()],
    PUBLISHED_AGENT,
    [{ id: KEY_ID, maxConcurrentRuns: 2 }],
    ...(options.idempotent ? [[]] : []),
    [{ activeRuns: options.activeRuns ?? 0 }],
    [],
    [{ id: RUN_ID }],
  ];
}

function createService(results: QueryResult[]) {
  const { db, operations } = createDbMock(results);
  const runService = {
    loadRunDtos: vi.fn(async () => [runDto()]),
    failActiveRuns: vi.fn(async () => undefined),
    cancelQueuedRun: vi.fn(async () => true),
    cancelQueuedRuns: vi.fn(async () => undefined),
    findActiveRunId: vi.fn(async () => null),
  };
  const eventStream = {
    append: vi.fn(async () => '1-0'),
    getBounds: vi.fn(async (): Promise<AgentApiStreamBounds> => ({
      exists: true,
      firstId: '100-0',
      lastId: '200-0',
    })),
    subscribe: vi.fn(
      async (
        _runId: string,
        _afterId: string | null,
        _onEntry: (entry: AgentApiStreamEntry) => void,
        signal: AbortSignal,
      ) =>
        new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        ),
    ),
  };
  const conversationService = {
    insertUserMessage: vi.fn(async () => ({ id: MESSAGE_ID })),
    cancel: vi.fn(async () => ({ data: {} })),
  };
  const executionService = {
    dispatchExecution: vi.fn(async () => undefined),
    abortExecution: vi.fn(async () => undefined),
  };
  const eventEmitter = { emit: vi.fn() };

  const service = new AgentApiService(
    db,
    runService as never,
    eventStream as never,
    conversationService as never,
    executionService as never,
    eventEmitter as never,
  );

  return {
    service,
    operations,
    results,
    runService,
    eventStream,
    conversationService,
    executionService,
    eventEmitter,
  };
}

describe('AgentApiService', () => {
  afterEach(() => {
    delete process.env.APP_SANDBOX_MAINTENANCE_MODE;
    vi.useRealTimers();
  });

  describe('归属校验', () => {
    it('对话不属于当前 Key 或绑定 Agent 时返回 404 agent-api-conversation-not-found', async () => {
      const { service } = createService([[]]);

      await expect(
        service.getConversation(KEY, OTHER_CONVERSATION_ID),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/agent-api-conversation-not-found',
        status: 404,
      });
    });

    it('非 UUID 的对话 id 同样返回 404，而不是数据库错误', async () => {
      const { service } = createService([]);

      await expect(
        service.getConversation(KEY, 'not-a-uuid'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('run 不属于路径中的对话时返回 404 agent-api-run-not-found', async () => {
      const { service, runService } = createService([[conversationRow()]]);
      runService.loadRunDtos.mockResolvedValueOnce([
        runDto({ conversationId: OTHER_CONVERSATION_ID }),
      ]);

      await expect(
        service.getRun(KEY, CONVERSATION_ID, RUN_ID),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/agent-api-run-not-found',
        status: 404,
      });
    });

    it('对外对话不暴露执行进程写入的 metadata.execution', async () => {
      const { service } = createService([
        [
          conversationRow({
            metadata: { orderId: '1024', execution: { sessionId: 's-1' } },
          }),
        ],
      ]);

      const conversation = await service.getConversation(KEY, CONVERSATION_ID);

      expect(conversation.metadata).toEqual({ orderId: '1024' });
    });
  });

  describe('Agent 发布状态', () => {
    it.each([
      [
        'archived',
        { status: 'archived', publishedVersionId: VERSION_ID },
        'agent-archived',
      ],
      ['draft', { status: 'draft', publishedVersionId: null }, 'agent-not-published'],
      [
        'published 但没有发布版本',
        { status: 'published', publishedVersionId: null },
        'agent-not-published',
      ],
    ])('%s 时创建对话返回 409', async (_label, agent, type) => {
      const { service, operations } = createService([[agent]]);

      await expect(service.createConversation(KEY, {})).rejects.toMatchObject({
        type: `https://agentloom.dev/errors/${type}`,
        status: 409,
      });
      expect(operations.some((op) => op.kind === 'insert')).toBe(false);
    });

    it('Agent 未发布时创建 run 返回 409 且不写入消息', async () => {
      const { service, conversationService } = createService([
        [conversationRow()],
        [{ status: 'draft', publishedVersionId: null }],
      ]);

      await expect(
        service.createRun(KEY, CONVERSATION_ID, { body: RUN_BODY }),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/agent-not-published',
      });
      expect(conversationService.insertUserMessage).not.toHaveBeenCalled();
    });

    it('API 对话以服务身份创建：source=api、无创建人、记录 Key 与外部用户', async () => {
      const { service, operations } = createService([
        PUBLISHED_AGENT,
        (op) => [conversationRow(op.values)],
      ]);

      const conversation = await service.createConversation(KEY, {
        title: '订单 #1024 售后',
        externalUserId: 'crm-user-77',
        metadata: { orderId: '1024' },
      });

      expect(operations.find((op) => op.kind === 'insert')?.values).toMatchObject(
        {
          source: 'api',
          createdBy: null,
          apiKeyId: KEY_ID,
          externalUserId: 'crm-user-77',
        },
      );
      expect(conversation).toMatchObject({
        title: '订单 #1024 售后',
        status: 'active',
        externalUserId: 'crm-user-77',
        metadata: { orderId: '1024' },
      });
    });
  });

  describe('createRun', () => {
    it('已结束的对话返回 409 conversation-ended', async () => {
      const { service } = createService([
        [conversationRow({ status: 'ended' })],
      ]);

      await expect(
        service.createRun(KEY, CONVERSATION_ID, { body: RUN_BODY }),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/conversation-ended',
        status: 409,
      });
    });

    it('Key 的活跃 run 达到上限时返回 429 concurrency-limit-exceeded 与 Retry-After', async () => {
      const { service, conversationService } = createService(
        freshRunQueries({ activeRuns: 2 }),
      );

      await expect(
        service.createRun(KEY, CONVERSATION_ID, { body: RUN_BODY }),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/concurrency-limit-exceeded',
        status: 429,
        headers: { 'Retry-After': '5' },
      });
      expect(conversationService.insertUserMessage).not.toHaveBeenCalled();
    });

    it('对话已有活跃 run 时返回 409 conversation-busy 并带 activeRunId', async () => {
      const queries = freshRunQueries();
      queries[4] = [{ id: RUN_ID }];
      const { service } = createService(queries);

      await expect(
        service.createRun(KEY, CONVERSATION_ID, { body: RUN_BODY }),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/conversation-busy',
        extensions: { activeRunId: RUN_ID },
      });
    });

    it('维护模式下返回 503 sandbox-maintenance 与 Retry-After，不写入任何数据', async () => {
      process.env.APP_SANDBOX_MAINTENANCE_MODE = 'true';
      const { service, operations } = createService([]);

      await expect(
        service.createRun(KEY, CONVERSATION_ID, { body: RUN_BODY }),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/sandbox-maintenance',
        status: 503,
        headers: { 'Retry-After': '30' },
      });
      expect(operations).toHaveLength(0);
    });

    it('提交后先写 run.created 再派发；派发失败时把 run 标记 failed 并返回 503', async () => {
      const { service, eventStream, executionService, runService, eventEmitter } =
        createService(freshRunQueries());
      executionService.dispatchExecution.mockRejectedValueOnce(
        new Error('queue down'),
      );

      await expect(
        service.createRun(KEY, CONVERSATION_ID, { body: RUN_BODY }),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/run-dispatch-failed',
        status: 503,
      });
      expect(eventStream.append).toHaveBeenCalledWith(RUN_ID, {
        event: 'run.created',
        data: { run: runDto() },
      });
      expect(runService.failActiveRuns).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        error: {
          type: 'https://agentloom.dev/errors/run-dispatch-failed',
          title: 'Run dispatch failed',
        },
      });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('附件不符合对话附件规则时返回 422 validation-error', async () => {
      const { service, conversationService } = createService(
        freshRunQueries(),
      );
      conversationService.insertUserMessage.mockRejectedValueOnce(
        new BadRequestException('图片附件必须提供 dataBase64'),
      );

      await expect(
        service.createRun(KEY, CONVERSATION_ID, {
          body: {
            input: {
              content: '看图',
              attachments: [
                {
                  kind: 'image',
                  fileName: 'a.png',
                  mimeType: 'image/png',
                  sizeBytes: 10,
                },
              ],
            },
          },
        }),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/validation-error',
        status: 422,
      });
    });

    it('Idempotency-Key 同 body 重放返回首次的 run，换 body 返回 422', async () => {
      const first = createService(freshRunQueries({ idempotent: true }));
      const created = await first.service.createRun(KEY, CONVERSATION_ID, {
        body: RUN_BODY,
        idempotencyKey: 'order-1024-msg-1',
      });
      const stored = first.operations.find(
        (op) => op.kind === 'insert',
      )?.values;
      expect(created.replayed).toBe(false);
      expect(stored).toMatchObject({ idempotencyKey: 'order-1024-msg-1' });

      const existing = [{ id: RUN_ID, requestHash: stored?.requestHash }];
      const replay = createService([existing]);
      replay.runService.loadRunDtos.mockResolvedValueOnce([
        runDto({ status: 'running' }),
      ]);
      const replayed = await replay.service.createRun(KEY, CONVERSATION_ID, {
        body: { input: { content: '我的订单还没发货' } },
        idempotencyKey: 'order-1024-msg-1',
      });
      expect(replayed).toEqual({
        run: runDto({ status: 'running' }),
        replayed: true,
      });
      expect(replay.executionService.dispatchExecution).not.toHaveBeenCalled();
      expect(replay.operations.some((op) => op.kind === 'insert')).toBe(false);

      const reused = createService([existing]);
      await expect(
        reused.service.createRun(KEY, CONVERSATION_ID, {
          body: { input: { content: '另一条消息' } },
          idempotencyKey: 'order-1024-msg-1',
        }),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/idempotency-key-reused',
        status: 422,
      });

      const otherConversation = createService([existing]);
      await expect(
        otherConversation.service.createRun(KEY, OTHER_CONVERSATION_ID, {
          body: RUN_BODY,
          idempotencyKey: 'order-1024-msg-1',
        }),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('waitForRun', () => {
    it('等待期内收到终态事件时返回终态 run', async () => {
      const { service, eventStream } = createService([]);
      const completed = runDto({ status: 'completed', completedAt: NOW.toISOString() });
      eventStream.subscribe.mockImplementationOnce(
        async (_runId, _afterId, onEntry, signal) => {
          onEntry({
            id: '1-0',
            event: { event: 'run.created', data: { run: runDto() } },
          });
          setTimeout(() => {
            onEntry({
              id: '2-0',
              event: { event: 'run.completed', data: { run: completed } },
            });
          }, 20);
          await new Promise<void>((resolve) =>
            signal.addEventListener('abort', () => resolve(), { once: true }),
          );
        },
      );

      await expect(service.waitForRun(KEY, runDto(), 5)).resolves.toEqual(
        completed,
      );
    });

    it('超时仍未结束时返回数据库中的当前 run', async () => {
      vi.useFakeTimers();
      const { service, runService } = createService([[conversationRow()]]);
      runService.loadRunDtos.mockResolvedValueOnce([
        runDto({ status: 'running' }),
      ]);

      const waiting = service.waitForRun(KEY, runDto(), 2);
      await vi.advanceTimersByTimeAsync(2000);

      await expect(waiting).resolves.toMatchObject({ status: 'running' });
    });
  });

  describe('cancelRun', () => {
    it.each(['completed', 'failed'] as const)(
      '%s 的 run 返回 409 run-not-cancellable',
      async (status) => {
        const { service, runService, executionService } = createService([
          [conversationRow()],
        ]);
        runService.loadRunDtos.mockResolvedValueOnce([runDto({ status })]);

        await expect(
          service.cancelRun(KEY, CONVERSATION_ID, RUN_ID),
        ).rejects.toMatchObject({
          type: 'https://agentloom.dev/errors/run-not-cancellable',
          status: 409,
        });
        expect(executionService.abortExecution).not.toHaveBeenCalled();
      },
    );

    it('已取消的 run 幂等返回当前状态', async () => {
      const { service, runService, executionService } = createService([
        [conversationRow()],
      ]);
      runService.loadRunDtos.mockResolvedValueOnce([
        runDto({ status: 'cancelled' }),
      ]);

      await expect(
        service.cancelRun(KEY, CONVERSATION_ID, RUN_ID),
      ).resolves.toMatchObject({ status: 'cancelled' });
      expect(executionService.abortExecution).not.toHaveBeenCalled();
    });

    it('queued 的 run 被标记为 cancelled，且不结束对话', async () => {
      const { service, runService, conversationService } = createService([
        [conversationRow()],
        [conversationRow()],
      ]);
      runService.loadRunDtos
        .mockResolvedValueOnce([runDto({ status: 'queued' })])
        .mockResolvedValueOnce([
          runDto({ status: 'cancelled', stopReason: 'cancelled' }),
        ]);

      const run = await service.cancelRun(KEY, CONVERSATION_ID, RUN_ID);

      expect(runService.cancelQueuedRun).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        conversationId: CONVERSATION_ID,
        runId: RUN_ID,
      });
      expect(run.status).toBe('cancelled');
      expect(conversationService.cancel).not.toHaveBeenCalled();
    });
  });

  describe('openRunEvents', () => {
    it('事件流已不存在时返回 410 run-events-expired', async () => {
      const { service, runService, eventStream } = createService([
        [conversationRow()],
      ]);
      runService.loadRunDtos.mockResolvedValueOnce([
        runDto({ status: 'running' }),
      ]);
      eventStream.getBounds.mockResolvedValueOnce({
        exists: false,
        firstId: null,
        lastId: null,
      });

      await expect(
        service.openRunEvents(KEY, CONVERSATION_ID, RUN_ID),
      ).rejects.toMatchObject({
        type: 'https://agentloom.dev/errors/run-events-expired',
        status: 410,
      });
    });

    it.each([
      ['不带 Last-Event-ID 从头回放', undefined, null],
      ['Last-Event-ID 早于保留的第一条时从剩余开头续传', '50-0', null],
      ['Last-Event-ID 在保留范围内时从其后续传', '150-0', '150-0'],
    ])('%s', async (_label, lastEventId, afterId) => {
      const { service } = createService([[conversationRow()]]);

      await expect(
        service.openRunEvents(KEY, CONVERSATION_ID, RUN_ID, lastEventId),
      ).resolves.toEqual({ afterId, completed: false });
    });

    it('终态 run 的游标已越过最后一条事件时直接结束', async () => {
      const { service, runService } = createService([[conversationRow()]]);
      runService.loadRunDtos.mockResolvedValueOnce([
        runDto({ status: 'completed' }),
      ]);

      await expect(
        service.openRunEvents(KEY, CONVERSATION_ID, RUN_ID, '200-0'),
      ).resolves.toEqual({ afterId: '200-0', completed: true });
    });

    it('格式非法的 Last-Event-ID 返回 422', async () => {
      const { service } = createService([]);

      await expect(
        service.openRunEvents(KEY, CONVERSATION_ID, RUN_ID, 'abc'),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('endConversation', () => {
    it('已结束的对话重复调用直接返回，不再触发结束流程', async () => {
      const { service, conversationService, executionService } = createService(
        [[conversationRow({ status: 'ended' })]],
      );

      await expect(
        service.endConversation(KEY, CONVERSATION_ID),
      ).resolves.toMatchObject({ status: 'ended' });
      expect(conversationService.cancel).not.toHaveBeenCalled();
      expect(executionService.abortExecution).not.toHaveBeenCalled();
    });
  });
});
