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

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    (_db: any, _tenantId: string, op: () => Promise<any>) => op(),
  ),
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

      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));
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

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await service.destroySandbox(TEST_EXECUTION_ID, TEST_TENANT_ID);

      expect(db.update).toHaveBeenCalledOnce();
      expect(mockLifecycleProducer.addDestroyTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        executionId: TEST_EXECUTION_ID,
        tenantId: TEST_TENANT_ID,
        containerId: 'container-abc',
        persistencePath: 'tenants/t1/sandboxes/e1',
      });
    });

    it('アクティブセッション未発見時にスキップ（warn ログ出力）', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

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
        tenantId: TEST_TENANT_ID,
        containerId: 'container-conv',
      });
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
