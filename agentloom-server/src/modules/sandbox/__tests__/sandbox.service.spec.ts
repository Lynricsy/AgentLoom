import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

import { DRIZZLE } from '../../../database/database.module';
import { SandboxService } from '../sandbox.service';
import { SandboxLifecycleProducer } from '../sandbox-lifecycle.producer';
import { SandboxNotFoundException } from '../sandbox.exceptions';
import { DockerService } from '../docker.service';
import type { SandboxConfig, SandboxSession } from '../../../database/schema';

const tenantTransactionMocks = vi.hoisted(() => ({
  runInTenantTransaction: vi.fn(
    (_db: any, _tenantId: string, op: () => Promise<any>) => op(),
  ),
  hasActiveTenantTransaction: vi.fn(() => false),
  registerAfterCommitHook: vi.fn(),
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: tenantTransactionMocks.runInTenantTransaction,
  hasActiveTenantTransaction: tenantTransactionMocks.hasActiveTenantTransaction,
  registerAfterCommitHook: tenantTransactionMocks.registerAfterCommitHook,
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn((db: any) => db),
}));

function createSelectChainWithLimit(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createSelectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createInsertChainReturning(result: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createUpdateChainReturning(result: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createSelectChainWithOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createSelectChainForList(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

function createSelectChainForCount(total: number) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ total }]),
    }),
  };
}

function createUpdateChainNoReturn() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function renderSql(sql: Parameters<PgDialect['sqlToQuery']>[0]): string {
  return new PgDialect().sqlToQuery(sql).sql;
}

function renderSqlWithParams(sql: Parameters<PgDialect['sqlToQuery']>[0]) {
  return new PgDialect().sqlToQuery(sql);
}

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_EXECUTION_ID = '00000000-0000-0000-0000-000000000002';
const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000003';
const TEST_CONVERSATION_ID = '00000000-0000-0000-0000-000000000004';

const TEST_CONFIG: SandboxConfig = {
  cpu: 1,
  memory: 512,
  disk: 2,
  timeout: 2,
};

function buildSession(overrides?: Partial<SandboxSession>): SandboxSession {
  return {
    id: TEST_SESSION_ID,
    executionId: TEST_EXECUTION_ID,
    sandboxNodeId: 'sandbox-1',
    tenantId: TEST_TENANT_ID,
    containerId: null,
    status: 'creating',
    config: TEST_CONFIG,
    workspacePath: null,
    agentConversationId: null,
    startedAt: null,
    stoppedAt: null,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('SandboxService', () => {
  let service: SandboxService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let mockLifecycleProducer: Record<string, ReturnType<typeof vi.fn>>;
  let mockDockerService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    tenantTransactionMocks.hasActiveTenantTransaction.mockReturnValue(false);
    tenantTransactionMocks.registerAfterCommitHook.mockImplementation(() => {});

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    };

    mockLifecycleProducer = {
      addCreateTask: vi.fn().mockResolvedValue(undefined),
      addDestroyTask: vi.fn().mockResolvedValue(undefined),
    };

    mockDockerService = {
      getContainerStats: vi.fn(),
    };

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [
        SandboxService,
        { provide: DRIZZLE, useValue: db },
        {
          provide: SandboxLifecycleProducer,
          useValue: mockLifecycleProducer,
        },
        {
          provide: DockerService,
          useValue: mockDockerService,
        },
      ],
    }).compile();

    service = module.get(SandboxService);
  });

  describe('createSandboxSession', () => {
    it('既存アクティブセッション無しの場合、新規セッションを作成してキューに投入', async () => {
      const newSession = buildSession();

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]));
      db.insert.mockReturnValueOnce(createInsertChainReturning([newSession]));

      const result = await service.createSandboxSession({
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-1',
        config: TEST_CONFIG,
        tenantId: TEST_TENANT_ID,
      });

      expect(result).toEqual(newSession);
      expect(db.insert).toHaveBeenCalledOnce();
      expect(mockLifecycleProducer.addCreateTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-1',
        tenantId: TEST_TENANT_ID,
        config: TEST_CONFIG,
      });
    });

    it('アクティブセッション既存の場合、既存セッションを再利用', async () => {
      const existing = buildSession({ status: 'ready' });

      db.select.mockReturnValueOnce(createSelectChainWithLimit([existing]));

      const result = await service.createSandboxSession({
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-1',
        config: TEST_CONFIG,
        tenantId: TEST_TENANT_ID,
      });

      expect(result).toEqual(existing);
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addCreateTask).not.toHaveBeenCalled();
    });

    it('conversation 绑定时应按 agentConversationId 创建新会话', async () => {
      const newSession = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        sandboxNodeId: null,
      });

      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));
      db.insert.mockReturnValueOnce(createInsertChainReturning([newSession]));

      const result = await service.createSandboxSession({
        sandboxNodeId: null,
        config: TEST_CONFIG,
        tenantId: TEST_TENANT_ID,
        agentConversationId: TEST_CONVERSATION_ID,
      });

      expect(result).toEqual(newSession);
      expect(mockLifecycleProducer.addCreateTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        agentConversationId: TEST_CONVERSATION_ID,
        tenantId: TEST_TENANT_ID,
        config: TEST_CONFIG,
      });
    });

    it('事务内创建新会话时应通过隔离事务先落库，再立即入队 create task', async () => {
      const newSession = buildSession();
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        insert: vi
          .fn()
          .mockReturnValue(createInsertChainReturning([newSession])),
      };

      tenantTransactionMocks.hasActiveTenantTransaction.mockReturnValue(true);
      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]));
      db.transaction.mockImplementationOnce(
        async (callback: (client: typeof tx) => Promise<SandboxSession>) =>
          callback(tx),
      );

      const result = await service.createSandboxSession({
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-1',
        config: TEST_CONFIG,
        tenantId: TEST_TENANT_ID,
      });

      expect(result).toEqual(newSession);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(tx.execute).toHaveBeenCalledTimes(2);
      expect(tx.insert).toHaveBeenCalledTimes(1);
      expect(
        tenantTransactionMocks.registerAfterCommitHook,
      ).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addCreateTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-1',
        tenantId: TEST_TENANT_ID,
        config: TEST_CONFIG,
      });
    });

    it('同一 execution 下引用同一持久沙箱资源的第二个节点应追加独立绑定而不是冲突失败', async () => {
      const persistentSession = buildSession({
        status: 'ready',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Persistent Sandbox',
          activeBindings: [
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-1',
            },
          ],
        },
      });
      const attachedSession = buildSession({
        status: 'ready',
        sandboxNodeId: null,
        config: {
          ...persistentSession.config,
          activeBindings: [
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-1',
            },
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-2',
            },
          ],
        },
      });
      const updateChain = createUpdateChainNoReturn();

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([persistentSession]))
        .mockReturnValueOnce(createSelectChainWithLimit([attachedSession]));
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.createSandboxSession({
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-2',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          persistentSandboxId: TEST_SESSION_ID,
        },
        tenantId: TEST_TENANT_ID,
      });

      expect(result).toEqual(attachedSession);
      expect(mockLifecycleProducer.addCreateTask).not.toHaveBeenCalled();

      const [setPayload] = updateChain.set.mock.calls[0] ?? [];
      expect(setPayload).toMatchObject({
        executionId: TEST_EXECUTION_ID,
        agentConversationId: null,
        sandboxNodeId: null,
        config: expect.objectContaining({
          activeBindings: [
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-1',
            },
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-2',
            },
          ],
        }),
      });
    });
  });

  describe('getSandboxSession', () => {
    it('findByExecutionId 命中时返回会话', async () => {
      const session = buildSession({ status: 'ready' });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));

      const result = await service.findByExecutionId(
        TEST_EXECUTION_ID,
        TEST_TENANT_ID,
      );
      expect(result).toEqual(session);
    });

    it('アクティブセッション発見時にセッションを返す', async () => {
      const session = buildSession({ status: 'ready' });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));

      const result = await service.getSandboxSession(
        TEST_EXECUTION_ID,
        TEST_TENANT_ID,
      );
      expect(result).toEqual(session);
    });

    it('アクティブセッション未発見時に null を返す', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      const result = await service.getSandboxSession(
        TEST_EXECUTION_ID,
        TEST_TENANT_ID,
      );
      expect(result).toBeNull();
    });

    it('应将 stopping 视为非活跃会话，避免复用或重复释放', async () => {
      const selectChain = createSelectChainWithLimit([]);
      db.select.mockReturnValueOnce(selectChain);

      await service.getSandboxSession(TEST_EXECUTION_ID, TEST_TENANT_ID);

      const [whereClause] = selectChain.from().where.mock.calls[0] ?? [];
      const rendered = renderSqlWithParams(whereClause);

      expect(rendered.sql.toLowerCase()).toContain('not in');
      expect(rendered.params).toContain('stopping');
      expect(rendered.params).toContain('stopped');
      expect(rendered.params).toContain('failed');
    });

    it('findByConversationId 命中时返回会话', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        status: 'ready',
      });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));

      const result = await service.findByConversationId(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(result).toEqual(session);
    });

    it('当持久沙箱记录同时绑定多个 workflow 节点时，应按 activeBindings 回退命中对应节点', async () => {
      const sharedPersistentSession = buildSession({
        status: 'ready',
        sandboxNodeId: null,
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          activeBindings: [
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-1',
            },
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-2',
            },
          ],
        },
      });

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(
          createSelectChainWithLimit([sharedPersistentSession]),
        );

      const result = await service.getSandboxSession(
        TEST_EXECUTION_ID,
        TEST_TENANT_ID,
        'sandbox-2',
      );

      expect(result).toEqual(sharedPersistentSession);
    });
  });

  describe('updateSessionStatus', () => {
    it('セッションステータスを正常に更新', async () => {
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await expect(
        service.updateSessionStatus(TEST_SESSION_ID, 'ready', {
          containerId: 'container-abc',
          startedAt: new Date(),
        }),
      ).resolves.toBeUndefined();

      expect(db.update).toHaveBeenCalledOnce();
    });

    it('セッション未発見時に SandboxNotFoundException を投げる', async () => {
      db.update.mockReturnValueOnce(createUpdateChainReturning([]));

      await expect(
        service.updateSessionStatus(TEST_SESSION_ID, 'ready'),
      ).rejects.toThrow(SandboxNotFoundException);
    });
  });

  describe('destroySandbox', () => {
    it('アクティブセッション発見時にステータス更新 → destroy キュー投入', async () => {
      const session = buildSession({
        status: 'ready',
        containerId: 'container-abc',
        config: {
          ...TEST_CONFIG,
          persistencePath: 'tenants/t1/sandboxes/e1',
        },
      });

      db.select
        .mockReturnValueOnce(createSelectChain([session]))
        .mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await service.destroySandbox(TEST_EXECUTION_ID, TEST_TENANT_ID);

      expect(db.update).toHaveBeenCalledOnce();
      expect(mockLifecycleProducer.addDestroyTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-1',
        tenantId: TEST_TENANT_ID,
        containerId: 'container-abc',
        persistencePath: 'tenants/t1/sandboxes/e1',
      });
    });

    it('アクティブセッション未発見時にスキップ（warn ログ出力）', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await service.destroySandbox(TEST_EXECUTION_ID, TEST_TENANT_ID);

      expect(db.update).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addDestroyTask).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('destroyConversationSandbox 命中时应按 conversation 绑定入队', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        status: 'ready',
        containerId: 'container-conv',
      });

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await service.destroyConversationSandbox(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(mockLifecycleProducer.addDestroyTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        agentConversationId: TEST_CONVERSATION_ID,
        sandboxNodeId: 'sandbox-1',
        tenantId: TEST_TENANT_ID,
        containerId: 'container-conv',
      });
    });

    it('事务内销毁执行级沙箱时应在提交后再入队 destroy task', async () => {
      const session = buildSession({
        status: 'ready',
        containerId: 'container-abc',
      });
      let afterCommitHook: (() => Promise<void>) | undefined;

      tenantTransactionMocks.hasActiveTenantTransaction.mockReturnValue(true);
      tenantTransactionMocks.registerAfterCommitHook.mockImplementation(
        (hook: () => Promise<void>) => {
          afterCommitHook = hook;
        },
      );
      db.select
        .mockReturnValueOnce(createSelectChain([session]))
        .mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await service.destroySandbox(TEST_EXECUTION_ID, TEST_TENANT_ID);

      expect(mockLifecycleProducer.addDestroyTask).not.toHaveBeenCalled();
      expect(
        tenantTransactionMocks.registerAfterCommitHook,
      ).toHaveBeenCalledTimes(1);
      expect(afterCommitHook).toBeTypeOf('function');

      await afterCommitHook?.();

      expect(mockLifecycleProducer.addDestroyTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-1',
        tenantId: TEST_TENANT_ID,
        containerId: 'container-abc',
      });
    });

    it('并发重复销毁时若会话已被其他请求切到 stopping，应跳过重复 destroy 入队', async () => {
      const session = buildSession({
        status: 'ready',
        containerId: 'container-abc',
      });

      db.select
        .mockReturnValueOnce(createSelectChain([session]))
        .mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.update.mockReturnValueOnce(createUpdateChainReturning([]));

      await service.destroySandbox(TEST_EXECUTION_ID, TEST_TENANT_ID);

      expect(mockLifecycleProducer.addDestroyTask).not.toHaveBeenCalled();
      expect(Logger.prototype.debug).toHaveBeenCalled();
    });

    it('persistent sandbox 在 execution 终态清理时应移除该 execution 的全部节点绑定', async () => {
      const sharedPersistentSession = buildSession({
        status: 'ready',
        sandboxNodeId: null,
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          activeBindings: [
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-1',
            },
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-2',
            },
          ],
        },
      });
      const updateChain = createUpdateChainNoReturn();

      db.select.mockReturnValueOnce(
        createSelectChain([sharedPersistentSession]),
      );
      db.update.mockReturnValueOnce(updateChain);

      await service.destroySandbox(TEST_EXECUTION_ID, TEST_TENANT_ID);

      expect(mockLifecycleProducer.addDestroyTask).not.toHaveBeenCalled();

      const [setPayload] = updateChain.set.mock.calls[0] ?? [];
      expect(setPayload).toMatchObject({
        executionId: null,
        agentConversationId: null,
        sandboxNodeId: null,
      });
      expect(setPayload?.config).toMatchObject({
        lifecycleMode: 'persistent',
      });
      expect(setPayload?.config?.activeBindings).toBeUndefined();
    });
  });

  describe('getSandboxLogs', () => {
    it('セッション ID でログを取得して時系列順で返す', async () => {
      const logs = [
        {
          id: 'log-1',
          sessionId: TEST_SESSION_ID,
          level: 'system',
          message: 'Created',
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
        {
          id: 'log-2',
          sessionId: TEST_SESSION_ID,
          level: 'stdout',
          message: 'Hello',
          createdAt: new Date('2025-01-01T00:00:01Z'),
        },
      ];
      db.select.mockReturnValueOnce(createSelectChainWithOrderBy(logs));

      const result = await service.getSandboxLogs(TEST_SESSION_ID);

      expect(result).toEqual(logs);
      expect(db.select).toHaveBeenCalledOnce();
    });

    it('ログが無い場合は空配列を返す', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithOrderBy([]));

      const result = await service.getSandboxLogs(TEST_SESSION_ID);

      expect(result).toEqual([]);
    });
  });

  describe('releaseExecutionSandbox', () => {
    it('共享同一持久沙箱资源的多个节点中，一个节点结束时只应移除自己的绑定', async () => {
      const sharedPersistentSession = buildSession({
        status: 'ready',
        sandboxNodeId: null,
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          activeBindings: [
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-1',
            },
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-2',
            },
          ],
        },
      });
      const updateChain = createUpdateChainNoReturn();

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(
          createSelectChainWithLimit([sharedPersistentSession]),
        );
      db.update.mockReturnValueOnce(updateChain);

      await service.releaseExecutionSandbox(
        TEST_EXECUTION_ID,
        'sandbox-1',
        TEST_TENANT_ID,
      );

      const [setPayload] = updateChain.set.mock.calls[0] ?? [];
      expect(setPayload).toMatchObject({
        executionId: TEST_EXECUTION_ID,
        agentConversationId: null,
        sandboxNodeId: 'sandbox-2',
        config: expect.objectContaining({
          activeBindings: [
            {
              executionId: TEST_EXECUTION_ID,
              sandboxNodeId: 'sandbox-2',
            },
          ],
        }),
      });
    });
  });

  describe('listSandboxes', () => {
    it('应返回分页结果', async () => {
      const session = buildSession({ status: 'ready' });
      db.select
        .mockReturnValueOnce(createSelectChainForList([session]))
        .mockReturnValueOnce(createSelectChainForCount(1));

      const result = await service.listSandboxes(TEST_TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: [session],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('搜索条件应将 UUID id cast 为 text 再执行 ILIKE，避免 Postgres uuid ~~* 错误', async () => {
      const listChain = createSelectChainForList([]);
      db.select
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(createSelectChainForCount(0));

      await service.listSandboxes(TEST_TENANT_ID, {
        page: 1,
        pageSize: 20,
        search: 'sandbox keyword',
      });

      const [whereClause] = listChain.from().where.mock.calls[0] ?? [];
      const rendered = renderSql(whereClause).toLowerCase();

      expect(rendered).toContain('"sandbox_sessions"."id"::text ilike');
      expect(rendered).not.toContain('"sandbox_sessions"."id" ilike');
      expect(rendered).toContain(
        '"sandbox_sessions"."config"->>\'name\' ilike',
      );
    });
  });

  describe('endConversationSandbox', () => {
    it('session モード（デフォルト）の場合、destroyConversationSandbox を呼び出す', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        status: 'ready',
        containerId: 'container-conv',
        config: TEST_CONFIG,
      });

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([session]))
        .mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await service.endConversationSandbox(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(mockLifecycleProducer.addDestroyTask).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: TEST_SESSION_ID,
          agentConversationId: TEST_CONVERSATION_ID,
          tenantId: TEST_TENANT_ID,
          containerId: 'container-conv',
        }),
      );
    });

    it('session モードで lifecycleMode が明示的に session の場合も destroy する', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        status: 'ready',
        containerId: 'container-conv',
        config: { ...TEST_CONFIG, lifecycleMode: 'session' as const },
      });

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([session]))
        .mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await service.endConversationSandbox(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(mockLifecycleProducer.addDestroyTask).toHaveBeenCalled();
    });

    it('persistent モードの場合、agentConversationId を null に設定して切断のみ', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        status: 'ready',
        containerId: 'container-conv',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent' as const,
          persistenceExpiryHours: 48,
        },
      });

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.update.mockReturnValueOnce(createUpdateChainNoReturn());

      await service.endConversationSandbox(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(mockLifecycleProducer.addDestroyTask).not.toHaveBeenCalled();
      expect(db.update).toHaveBeenCalledOnce();
    });

    it('アクティブセッション未発見時にスキップ', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      await service.endConversationSandbox(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(db.update).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addDestroyTask).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });
});
