import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

import { DRIZZLE } from '../../../database/database.module';
import { SandboxService } from '../sandbox.service';
import { SandboxLifecycleProducer } from '../sandbox-lifecycle.producer';
import {
  SandboxNotFoundException,
  SandboxMaintenanceException,
  SandboxProcessesUnavailableException,
  SandboxStatsUnavailableException,
} from '../sandbox.exceptions';
import type { SandboxConfig, SandboxSession } from '../../../database/schema';
import { SANDBOX_RUNTIME_DRIVER } from '../sandbox-runtime-driver.port';
import { WorkspaceService } from '../../workspace/workspace.service';

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
  let mockWorkspaceService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.APP_SANDBOX_MAINTENANCE_MODE;
    tenantTransactionMocks.hasActiveTenantTransaction.mockReturnValue(false);
    tenantTransactionMocks.registerAfterCommitHook.mockImplementation(() => {});

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      transaction: vi.fn(),
    };

    mockLifecycleProducer = {
      addCreateTask: vi.fn().mockResolvedValue(undefined),
      addStartTask: vi.fn().mockResolvedValue(undefined),
      addStopTask: vi.fn().mockResolvedValue(undefined),
      addDestroyTask: vi.fn().mockResolvedValue(undefined),
      addConversationIdleEndCheckTask: vi.fn().mockResolvedValue(undefined),
      removeTimeoutCheckTask: vi.fn().mockResolvedValue(undefined),
      removeConversationIdleEndCheckTask: vi.fn().mockResolvedValue(undefined),
    };

    mockDockerService = {
      healthCheck: vi.fn().mockResolvedValue(true),
      getContainerStats: vi.fn(),
      listContainerProcesses: vi.fn(),
      stopContainer: vi.fn().mockResolvedValue(undefined),
      removeContainer: vi.fn().mockResolvedValue(undefined),
    };

    mockWorkspaceService = {
      syncFromSandboxContainer: vi.fn().mockResolvedValue(undefined),
      restoreToSandbox: vi.fn().mockResolvedValue(undefined),
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
          provide: SANDBOX_RUNTIME_DRIVER,
          useValue: mockDockerService,
        },
        {
          provide: WorkspaceService,
          useValue: mockWorkspaceService,
        },
      ],
    }).compile();

    service = module.get(SandboxService);
  });

  describe('createSandboxSession', () => {
    it('维护模式应在任何数据库写入前拒绝创建', async () => {
      process.env.APP_SANDBOX_MAINTENANCE_MODE = 'true';

      await expect(
        service.createSandboxSession({
          executionId: TEST_EXECUTION_ID,
          sandboxNodeId: 'sandbox-1',
          config: TEST_CONFIG,
          tenantId: TEST_TENANT_ID,
        }),
      ).rejects.toBeInstanceOf(SandboxMaintenanceException);

      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addCreateTask).not.toHaveBeenCalled();
    });

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
      expect(mockWorkspaceService.restoreToSandbox).not.toHaveBeenCalled();
    });

    it('resource 态 ready persistent sandbox attach 时应写入 restoreWorkspaceId 并立即恢复工作区', async () => {
      const persistentSession = buildSession({
        executionId: null,
        sandboxNodeId: null,
        status: 'ready',
        containerId: 'container-persistent',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Persistent Sandbox',
        },
      });
      const attachedSession = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        sandboxNodeId: null,
        status: 'ready',
        containerId: 'container-persistent',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Persistent Sandbox',
          restoreWorkspaceId: 'workspace-hapi',
          activeBindings: [
            {
              agentConversationId: TEST_CONVERSATION_ID,
            },
          ],
        },
      });
      const updateChain = createUpdateChainNoReturn();

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([persistentSession]))
        .mockReturnValueOnce(createSelectChainWithLimit([attachedSession]));
      db.update.mockReturnValueOnce(updateChain);

      const result = await service.createSandboxSession({
        sandboxNodeId: null,
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          persistentSandboxId: TEST_SESSION_ID,
          restoreWorkspaceId: 'workspace-hapi',
        },
        tenantId: TEST_TENANT_ID,
        agentConversationId: TEST_CONVERSATION_ID,
      });

      expect(result).toEqual(attachedSession);
      const [setPayload] = updateChain.set.mock.calls[0] ?? [];
      expect(setPayload).toMatchObject({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        sandboxNodeId: null,
        config: expect.objectContaining({
          restoreWorkspaceId: 'workspace-hapi',
          activeBindings: [
            {
              agentConversationId: TEST_CONVERSATION_ID,
            },
          ],
        }),
      });
      expect(mockWorkspaceService.restoreToSandbox).toHaveBeenCalledWith(
        'workspace-hapi',
        'container-persistent',
        TEST_TENANT_ID,
      );
    });

    it('resource 态 ready persistent sandbox attach 时若 workspace 已被其他沙箱挂载则不应重复恢复', async () => {
      const persistentSession = buildSession({
        executionId: null,
        sandboxNodeId: null,
        status: 'ready',
        containerId: 'container-persistent',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Persistent Sandbox',
        },
      });
      const attachedSession = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        sandboxNodeId: null,
        status: 'ready',
        containerId: 'container-persistent',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Persistent Sandbox',
          restoreWorkspaceId: 'workspace-hapi',
          activeBindings: [
            {
              agentConversationId: TEST_CONVERSATION_ID,
            },
          ],
        },
      });
      const updateChain = createUpdateChainNoReturn();

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([persistentSession]))
        .mockReturnValueOnce(createSelectChainWithLimit([attachedSession]));
      db.execute.mockResolvedValueOnce({ rows: [{ count: 1 }] });
      db.update.mockReturnValueOnce(updateChain);

      await service.createSandboxSession({
        sandboxNodeId: null,
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          persistentSandboxId: TEST_SESSION_ID,
          restoreWorkspaceId: 'workspace-hapi',
        },
        tenantId: TEST_TENANT_ID,
        agentConversationId: TEST_CONVERSATION_ID,
      });

      expect(mockWorkspaceService.restoreToSandbox).not.toHaveBeenCalled();
    });

    it('failed 持久沙箱被 workflow 节点再次引用时应自动恢复并继续绑定', async () => {
      const failedPersistentSession = buildSession({
        status: 'failed',
        containerId: 'container-old',
        sandboxNodeId: null,
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
        status: 'creating',
        containerId: null,
        sandboxNodeId: null,
        config: {
          ...failedPersistentSession.config,
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
      const startSandboxSpy = vi
        .spyOn(service, 'startSandbox')
        .mockResolvedValue(attachedSession);

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(
          createSelectChainWithLimit([failedPersistentSession]),
        )
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
      expect(startSandboxSpy).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        TEST_TENANT_ID,
      );
      expect(mockLifecycleProducer.addCreateTask).not.toHaveBeenCalled();
    });

    it('ready 持久沙箱若记录已陈旧但容器缺失，再次引用时应先收口再自动恢复', async () => {
      const stalePersistentSession = buildSession({
        status: 'ready',
        containerId: 'container-missing',
        sandboxNodeId: null,
        startedAt: new Date('2025-01-02T00:00:00Z'),
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
      const reconciledStoppedSession = buildSession({
        ...stalePersistentSession,
        status: 'stopped',
        containerId: null,
        workspacePath: null,
        stoppedAt: new Date('2025-01-03T00:00:00Z'),
      });
      const attachedSession = buildSession({
        status: 'creating',
        containerId: null,
        sandboxNodeId: null,
        config: {
          ...stalePersistentSession.config,
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
      const updateBindingChain = createUpdateChainNoReturn();
      const reconcileUpdateChain = createUpdateChainReturning([
        reconciledStoppedSession,
      ]);
      const startSandboxSpy = vi
        .spyOn(service, 'startSandbox')
        .mockResolvedValue(attachedSession);

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(
          createSelectChainWithLimit([stalePersistentSession]),
        )
        .mockReturnValueOnce(createSelectChainWithLimit([attachedSession]));
      db.update
        .mockReturnValueOnce(reconcileUpdateChain)
        .mockReturnValueOnce(updateBindingChain);
      mockDockerService.healthCheck.mockResolvedValueOnce(false);

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
      expect(startSandboxSpy).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        TEST_TENANT_ID,
      );
      expect(mockLifecycleProducer.addCreateTask).not.toHaveBeenCalled();
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

  describe('getContainerStats', () => {
    it('应在 driver 返回磁盘占用时补齐磁盘总配额', async () => {
      const session = buildSession({
        containerId: 'container-abc123',
        status: 'ready',
        config: { ...TEST_CONFIG, disk: 6 },
      });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      mockDockerService.getContainerStats.mockResolvedValueOnce({
        cpuPercent: 10,
        memoryUsageMb: 128,
        memoryLimitMb: 512,
        diskUsage: 4096,
      });

      const result = await service.getContainerStats(TEST_SESSION_ID);

      expect(mockDockerService.getContainerStats).toHaveBeenCalledWith(
        'container-abc123',
      );
      expect(result).toEqual({
        cpuPercent: 10,
        memoryUsageMb: 128,
        memoryLimitMb: 512,
        diskUsage: 4096,
        diskTotal: 6 * 1024 * 1024 * 1024,
      });
    });

    it('应在 driver 读取容器统计失败时降级为统计不可用', async () => {
      const session = buildSession({
        containerId: 'container-missing',
        status: 'ready',
        startedAt: new Date('2025-01-02T00:00:00Z'),
      });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      mockDockerService.healthCheck.mockResolvedValueOnce(true);
      mockDockerService.getContainerStats.mockRejectedValueOnce(
        new Error('No such container'),
      );
      const updateChain = createUpdateChainReturning([
        buildSession({
          status: 'stopped',
          containerId: null,
          workspacePath: null,
          startedAt: session.startedAt,
          stoppedAt: new Date('2025-01-03T00:00:00Z'),
        }),
      ]);
      db.update.mockReturnValueOnce(updateChain);

      await expect(service.getContainerStats(TEST_SESSION_ID)).rejects.toThrow(
        SandboxStatsUnavailableException,
      );

      expect(mockDockerService.getContainerStats).toHaveBeenCalledWith(
        'container-missing',
      );
    });

    it('应在活跃沙箱记录已陈旧且容器缺失时先收口为 stopped', async () => {
      const staleSession = buildSession({
        containerId: 'container-gone',
        status: 'ready',
        startedAt: new Date('2025-01-02T00:00:00Z'),
      });
      const stoppedSession = buildSession({
        status: 'stopped',
        containerId: null,
        workspacePath: null,
        startedAt: staleSession.startedAt,
        stoppedAt: new Date('2025-01-03T00:00:00Z'),
      });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([staleSession]));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([stoppedSession]),
      );
      mockDockerService.healthCheck.mockResolvedValueOnce(false);

      await expect(service.getContainerStats(TEST_SESSION_ID)).rejects.toThrow(
        SandboxStatsUnavailableException,
      );

      expect(mockDockerService.getContainerStats).not.toHaveBeenCalled();
      expect(db.update).toHaveBeenCalledOnce();
    });
  });

  describe('getConversationSandboxProcesses', () => {
    it('应返回对话沙箱的标准化进程列表', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        containerId: 'container-abc123',
        status: 'ready',
      });
      const processes = [
        {
          pid: 1,
          cpuPercent: 18.4,
          memoryPercent: 6.2,
          state: 'Ss',
          elapsed: '12:34',
          executable: 'node',
          command: 'node dist/server.js',
        },
      ];

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      mockDockerService.listContainerProcesses.mockResolvedValueOnce(processes);

      const result = await service.getConversationSandboxProcesses(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(mockDockerService.listContainerProcesses).toHaveBeenCalledWith(
        'container-abc123',
      );
      expect(result).toEqual(processes);
    });

    it('driver 读取进程列表失败时应降级为进程列表不可用', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        containerId: 'container-missing',
        status: 'ready',
        startedAt: new Date('2025-01-02T00:00:00Z'),
      });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      mockDockerService.healthCheck.mockResolvedValueOnce(true);
      mockDockerService.listContainerProcesses.mockRejectedValueOnce(
        new Error('No such container'),
      );
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([
          buildSession({
            executionId: null,
            agentConversationId: TEST_CONVERSATION_ID,
            status: 'stopped',
            containerId: null,
            workspacePath: null,
            startedAt: session.startedAt,
            stoppedAt: new Date('2025-01-03T00:00:00Z'),
          }),
        ]),
      );

      await expect(
        service.getConversationSandboxProcesses(
          TEST_CONVERSATION_ID,
          TEST_TENANT_ID,
        ),
      ).rejects.toThrow(SandboxProcessesUnavailableException);

      expect(mockDockerService.listContainerProcesses).toHaveBeenCalledWith(
        'container-missing',
      );
    });
  });

  describe('conversation idle auto end', () => {
    it('应按 session config 的分钟数为对话沙箱调度 idle end check', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        status: 'ready',
        config: {
          ...TEST_CONFIG,
          conversationIdleAutoEndMinutes: 15,
        },
      });

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));

      await service.scheduleConversationIdleAutoEnd(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(
        mockLifecycleProducer.addConversationIdleEndCheckTask,
      ).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        tenantId: TEST_TENANT_ID,
        delayMs: 15 * 60 * 1000,
      });
    });

    it('取消对话 idle auto end 时应移除对应 session 的延迟任务', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        status: 'ready',
      });

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));

      await service.cancelConversationIdleAutoEnd(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(
        mockLifecycleProducer.removeConversationIdleEndCheckTask,
      ).toHaveBeenCalledWith(TEST_SESSION_ID);
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

  describe('startSandbox', () => {
    it('维护模式应在查询运行时状态前拒绝启动', async () => {
      process.env.APP_SANDBOX_MAINTENANCE_MODE = 'true';

      await expect(
        service.startSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).rejects.toBeInstanceOf(SandboxMaintenanceException);

      expect(db.select).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addStartTask).not.toHaveBeenCalled();
    });

    it('stopped 持久沙箱应复用原容器并入队 start 任务', async () => {
      const stoppedSession = buildSession({
        status: 'stopped',
        containerId: 'container-stopped',
        workspacePath: '/workspace/',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        stoppedAt: new Date('2025-01-02T00:00:00.000Z'),
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Persistent Sandbox',
        },
      });
      const creatingSession = buildSession({
        status: 'creating',
        containerId: 'container-stopped',
        workspacePath: '/workspace/',
        startedAt: null,
        stoppedAt: null,
        config: stoppedSession.config,
      });
      const updateChain = createUpdateChainReturning([{ id: TEST_SESSION_ID }]);

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([stoppedSession]))
        .mockReturnValueOnce(createSelectChainWithLimit([creatingSession]));
      db.update.mockReturnValueOnce(updateChain);

      await expect(
        service.startSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).resolves.toEqual(creatingSession);

      expect(mockDockerService.stopContainer).not.toHaveBeenCalled();
      expect(mockDockerService.removeContainer).not.toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'creating',
        startedAt: null,
        stoppedAt: null,
      });
      expect(mockLifecycleProducer.addStartTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-1',
        tenantId: TEST_TENANT_ID,
        containerId: 'container-stopped',
        config: stoppedSession.config,
      });
      expect(mockLifecycleProducer.addCreateTask).not.toHaveBeenCalled();
    });

    it('failed 持久沙箱应清理旧容器并重新入队 create 任务', async () => {
      const failedSession = buildSession({
        status: 'failed',
        containerId: 'container-old',
        workspacePath: '/workspace/',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        stoppedAt: new Date('2025-01-02T00:00:00.000Z'),
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Persistent Sandbox',
        },
      });
      const creatingSession = buildSession({
        status: 'creating',
        containerId: null,
        workspacePath: null,
        startedAt: null,
        stoppedAt: null,
        config: failedSession.config,
      });
      const updateChain = createUpdateChainReturning([{ id: TEST_SESSION_ID }]);

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([failedSession]))
        .mockReturnValueOnce(createSelectChainWithLimit([creatingSession]));
      db.update.mockReturnValueOnce(updateChain);

      await expect(
        service.startSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).resolves.toEqual(creatingSession);

      expect(mockDockerService.stopContainer).toHaveBeenCalledWith(
        'container-old',
      );
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith(
        'container-old',
        {
          removeVolumes: true,
        },
      );
      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'creating',
        containerId: null,
        workspacePath: null,
        startedAt: null,
        stoppedAt: null,
      });
      expect(mockLifecycleProducer.addCreateTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-1',
        tenantId: TEST_TENANT_ID,
        config: failedSession.config,
      });
    });
  });

  describe('stopSandbox', () => {
    it('persistent 沙箱应入队 stop task 而不是 destroy task', async () => {
      const session = buildSession({
        status: 'ready',
        containerId: 'container-abc',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          persistencePath: 'tenants/t1/sandboxes/e1',
        },
      });

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([session]))
        .mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await service.stopSandbox(TEST_SESSION_ID, TEST_TENANT_ID);

      expect(mockLifecycleProducer.addStopTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'sandbox-1',
        tenantId: TEST_TENANT_ID,
        containerId: 'container-abc',
        persistencePath: 'tenants/t1/sandboxes/e1',
        config: session.config,
      });
      expect(mockLifecycleProducer.addDestroyTask).not.toHaveBeenCalled();
    });
  });

  describe('deleteSandbox', () => {
    it('stopped 持久沙箱删除时也应 remove 已停止容器并清理 timeout job', async () => {
      const session = buildSession({
        status: 'stopped',
        containerId: 'container-stopped',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Persistent Sandbox',
        },
      });
      const deleteWhere = vi.fn().mockResolvedValue(undefined);

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.delete.mockReturnValue({ where: deleteWhere });

      await service.deleteSandbox(TEST_SESSION_ID, TEST_TENANT_ID);

      expect(mockLifecycleProducer.removeTimeoutCheckTask).toHaveBeenCalledWith(
        TEST_SESSION_ID,
      );
      expect(mockDockerService.stopContainer).not.toHaveBeenCalled();
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith(
        'container-stopped',
        {
          removeVolumes: true,
        },
      );
      expect(db.delete).toHaveBeenCalledTimes(2);
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
        containerId: 'container-shared',
        sandboxNodeId: null,
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          restoreWorkspaceId: 'workspace-shared',
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
      expect(
        mockWorkspaceService.syncFromSandboxContainer,
      ).not.toHaveBeenCalled();
    });

    it('最后一个 persistent execution binding 释放时应先同步 restoreWorkspaceId 再解绑', async () => {
      const persistentSession = buildSession({
        status: 'ready',
        containerId: 'container-shared',
        sandboxNodeId: 'sandbox-1',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          restoreWorkspaceId: 'workspace-shared',
        },
      });
      const updateChain = createUpdateChainNoReturn();

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([persistentSession]));
      db.update.mockReturnValueOnce(updateChain);

      await service.releaseExecutionSandbox(
        TEST_EXECUTION_ID,
        'sandbox-1',
        TEST_TENANT_ID,
      );

      expect(
        mockWorkspaceService.syncFromSandboxContainer,
      ).toHaveBeenCalledWith(
        'workspace-shared',
        'container-shared',
        TEST_TENANT_ID,
      );
      expect(
        mockWorkspaceService.syncFromSandboxContainer.mock
          .invocationCallOrder[0],
      ).toBeLessThan(updateChain.set.mock.invocationCallOrder[0]);
    });

    it('最后一个 binding 释放时若 workspace 仍被其他活跃沙箱挂载则不应提前同步', async () => {
      const persistentSession = buildSession({
        status: 'ready',
        containerId: 'container-shared',
        sandboxNodeId: 'sandbox-1',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          restoreWorkspaceId: 'workspace-shared',
        },
      });
      const updateChain = createUpdateChainNoReturn();

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([persistentSession]));
      db.execute.mockResolvedValueOnce({ rows: [{ count: 1 }] });
      db.update.mockReturnValueOnce(updateChain);

      await service.releaseExecutionSandbox(
        TEST_EXECUTION_ID,
        'sandbox-1',
        TEST_TENANT_ID,
      );

      expect(
        mockWorkspaceService.syncFromSandboxContainer,
      ).not.toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledOnce();
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
        data: [{ ...session, bindingType: 'execution' }],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('应支持按绑定类型过滤资源沙箱', async () => {
      const listChain = createSelectChainForList([]);
      db.select
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(createSelectChainForCount(0));

      await service.listSandboxes(TEST_TENANT_ID, {
        page: 1,
        pageSize: 20,
        bindingType: 'resource',
      });

      const [whereClause] = listChain.from().where.mock.calls[0] ?? [];
      const rendered = renderSql(whereClause).toLowerCase();

      expect(rendered).toContain('"sandbox_sessions"."execution_id" is null');
      expect(rendered).toContain(
        '"sandbox_sessions"."agent_conversation_id" is null',
      );
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

    it('应将已陈旧但容器缺失的活跃沙箱自动收口为 stopped 后返回', async () => {
      const staleSession = buildSession({
        status: 'ready',
        executionId: null,
        sandboxNodeId: null,
        containerId: 'container-gone',
        startedAt: new Date('2025-01-02T00:00:00Z'),
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Stale Sandbox',
        },
      });
      const stoppedSession = buildSession({
        ...staleSession,
        status: 'stopped',
        containerId: null,
        workspacePath: null,
        stoppedAt: new Date('2025-01-03T00:00:00Z'),
      });

      db.select
        .mockReturnValueOnce(createSelectChainForList([staleSession]))
        .mockReturnValueOnce(createSelectChainForCount(1));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([stoppedSession]),
      );
      mockDockerService.healthCheck.mockResolvedValueOnce(false);

      const result = await service.listSandboxes(TEST_TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: [{ ...stoppedSession, bindingType: 'resource' }],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      });
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
          restoreWorkspaceId: 'workspace-conv',
          persistenceExpiryHours: 48,
        },
      });

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      const updateChain = createUpdateChainNoReturn();
      db.update.mockReturnValueOnce(updateChain);

      await service.endConversationSandbox(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(mockLifecycleProducer.addDestroyTask).not.toHaveBeenCalled();
      expect(db.update).toHaveBeenCalledOnce();
      expect(
        mockWorkspaceService.syncFromSandboxContainer,
      ).toHaveBeenCalledWith(
        'workspace-conv',
        'container-conv',
        TEST_TENANT_ID,
      );
      expect(
        mockWorkspaceService.syncFromSandboxContainer.mock
          .invocationCallOrder[0],
      ).toBeLessThan(updateChain.set.mock.invocationCallOrder[0]);
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
