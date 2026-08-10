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
  SandboxInvalidStateException,
  SandboxProcessesUnavailableException,
  SandboxStatsUnavailableException,
  SandboxNotPersistentException,
} from '../sandbox.exceptions';
import type { SandboxConfig, SandboxSession } from '../../../database/schema';
import { SANDBOX_RUNTIME_DRIVER } from '../sandbox-runtime-driver.port';
import { WorkspaceService } from '../../workspace/workspace.service';
import { WorkspaceRuntimeLeaseService } from '../workspace-runtime-lease.service';

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
    runtimeHandle: null,
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
  let mockRuntimeDriver: Record<string, ReturnType<typeof vi.fn>>;
  let mockWorkspaceService: Record<string, ReturnType<typeof vi.fn>>;
  let mockWorkspaceLeaseService: Record<string, ReturnType<typeof vi.fn>>;

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
      upsertWorkspaceLeaseRenewal: vi.fn().mockResolvedValue(undefined),
      removeWorkspaceLeaseRenewal: vi.fn().mockResolvedValue(undefined),
    };

    mockRuntimeDriver = {
      healthCheck: vi.fn().mockResolvedValue(true),
      inspectRuntime: vi.fn().mockResolvedValue({ state: 'stopped' }),
      getRuntimeStats: vi.fn(),
      listRuntimeProcesses: vi.fn(),
      stopRuntime: vi.fn().mockResolvedValue(undefined),
      deleteRuntime: vi.fn().mockResolvedValue(undefined),
    };

    mockWorkspaceService = {
      syncFromSandboxContainer: vi.fn().mockResolvedValue(undefined),
      restoreToSandbox: vi.fn().mockResolvedValue(undefined),
    };
    mockWorkspaceLeaseService = {
      acquire: vi.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        sandboxSessionId: TEST_SESSION_ID,
        fencingToken: 1,
      }),
      renewOwned: vi.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        sandboxSessionId: TEST_SESSION_ID,
        fencingToken: 1,
      }),
      release: vi.fn().mockResolvedValue(undefined),
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
          useValue: mockRuntimeDriver,
        },
        {
          provide: WorkspaceService,
          useValue: mockWorkspaceService,
        },
        {
          provide: WorkspaceRuntimeLeaseService,
          useValue: mockWorkspaceLeaseService,
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
        runtimeHandle: 'container-persistent',
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
        runtimeHandle: 'container-persistent',
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

    it('resource 态 ready persistent sandbox attach 时 lease 冲突应拒绝恢复', async () => {
      const persistentSession = buildSession({
        executionId: null,
        sandboxNodeId: null,
        status: 'ready',
        runtimeHandle: 'container-persistent',
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Persistent Sandbox',
        },
      });
      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([persistentSession]));
      mockWorkspaceLeaseService.acquire.mockRejectedValueOnce(
        new Error('workspace lease conflict'),
      );

      await expect(
        service.createSandboxSession({
          sandboxNodeId: null,
          config: {
            ...TEST_CONFIG,
            lifecycleMode: 'persistent',
            persistentSandboxId: TEST_SESSION_ID,
            restoreWorkspaceId: 'workspace-hapi',
          },
          tenantId: TEST_TENANT_ID,
          agentConversationId: TEST_CONVERSATION_ID,
        }),
      ).rejects.toThrow('workspace lease conflict');

      expect(mockWorkspaceService.restoreToSandbox).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('failed 持久沙箱被 workflow 节点再次引用时应自动恢复并继续绑定', async () => {
      const failedPersistentSession = buildSession({
        status: 'failed',
        runtimeHandle: 'container-old',
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
        runtimeHandle: null,
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

    it('ready 持久沙箱对应 stopped runtime 时保留 handle 并显式恢复', async () => {
      const stalePersistentSession = buildSession({
        status: 'ready',
        runtimeHandle: 'container-missing',
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
        runtimeHandle: 'container-missing',
        workspacePath: null,
        stoppedAt: new Date('2025-01-03T00:00:00Z'),
      });
      const attachedSession = buildSession({
        status: 'creating',
        runtimeHandle: 'container-missing',
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
      mockRuntimeDriver.healthCheck.mockResolvedValueOnce(false);

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

  describe('getRuntimeStats', () => {
    it('应在 driver 返回磁盘占用时补齐磁盘总配额', async () => {
      const session = buildSession({
        runtimeHandle: 'container-abc123',
        status: 'ready',
        config: { ...TEST_CONFIG, disk: 6 },
      });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      mockRuntimeDriver.getRuntimeStats.mockResolvedValueOnce({
        cpuPercent: 10,
        memoryUsageMb: 128,
        memoryLimitMb: 512,
        diskUsage: 4096,
      });

      const result = await service.getRuntimeStats(TEST_SESSION_ID);

      expect(mockRuntimeDriver.getRuntimeStats).toHaveBeenCalledWith(
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
        runtimeHandle: 'container-missing',
        status: 'ready',
        startedAt: new Date('2025-01-02T00:00:00Z'),
      });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      mockRuntimeDriver.healthCheck.mockResolvedValueOnce(true);
      mockRuntimeDriver.getRuntimeStats.mockRejectedValueOnce(
        new Error('No such container'),
      );
      const updateChain = createUpdateChainReturning([
        buildSession({
          status: 'stopped',
          runtimeHandle: null,
          workspacePath: null,
          startedAt: session.startedAt,
          stoppedAt: new Date('2025-01-03T00:00:00Z'),
        }),
      ]);
      db.update.mockReturnValueOnce(updateChain);

      await expect(service.getRuntimeStats(TEST_SESSION_ID)).rejects.toThrow(
        SandboxStatsUnavailableException,
      );

      expect(mockRuntimeDriver.getRuntimeStats).toHaveBeenCalledWith(
        'container-missing',
      );
    });

    it('manager 报告 stopped 时收口状态但保留 durable runtime handle', async () => {
      const staleSession = buildSession({
        runtimeHandle: 'container-gone',
        status: 'ready',
        startedAt: new Date('2025-01-02T00:00:00Z'),
      });
      const stoppedSession = buildSession({
        status: 'stopped',
        runtimeHandle: 'container-gone',
        workspacePath: null,
        startedAt: staleSession.startedAt,
        stoppedAt: new Date('2025-01-03T00:00:00Z'),
      });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([staleSession]));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([stoppedSession]),
      );
      mockRuntimeDriver.healthCheck.mockResolvedValueOnce(false);

      await expect(service.getRuntimeStats(TEST_SESSION_ID)).rejects.toThrow(
        SandboxStatsUnavailableException,
      );

      expect(mockRuntimeDriver.getRuntimeStats).not.toHaveBeenCalled();
      expect(db.update).toHaveBeenCalledOnce();
    });
  });

  describe('getConversationSandboxProcesses', () => {
    it('应返回对话沙箱的标准化进程列表', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        runtimeHandle: 'container-abc123',
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
      mockRuntimeDriver.listRuntimeProcesses.mockResolvedValueOnce(processes);

      const result = await service.getConversationSandboxProcesses(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(mockRuntimeDriver.listRuntimeProcesses).toHaveBeenCalledWith(
        'container-abc123',
      );
      expect(result).toEqual(processes);
    });

    it('driver 读取进程列表失败时应降级为进程列表不可用', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        runtimeHandle: 'container-missing',
        status: 'ready',
        startedAt: new Date('2025-01-02T00:00:00Z'),
      });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      mockRuntimeDriver.healthCheck.mockResolvedValueOnce(true);
      mockRuntimeDriver.listRuntimeProcesses.mockRejectedValueOnce(
        new Error('No such container'),
      );
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([
          buildSession({
            executionId: null,
            agentConversationId: TEST_CONVERSATION_ID,
            status: 'stopped',
            runtimeHandle: null,
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

      expect(mockRuntimeDriver.listRuntimeProcesses).toHaveBeenCalledWith(
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
          runtimeHandle: 'container-abc',
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
        runtimeHandle: 'container-abc',
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
        runtimeHandle: 'container-abc',
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
        runtimeHandle: 'container-conv',
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
        runtimeHandle: 'container-conv',
      });
    });

    it('事务内销毁执行级沙箱时应在提交后再入队 destroy task', async () => {
      const session = buildSession({
        status: 'ready',
        runtimeHandle: 'container-abc',
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
        runtimeHandle: 'container-abc',
      });
    });

    it('并发重复销毁时若会话已被其他请求切到 stopping，应跳过重复 destroy 入队', async () => {
      const session = buildSession({
        status: 'ready',
        runtimeHandle: 'container-abc',
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
        runtimeHandle: 'container-stopped',
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
        runtimeHandle: 'container-stopped',
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

      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.deleteRuntime).not.toHaveBeenCalled();
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
        runtimeHandle: 'container-stopped',
        config: stoppedSession.config,
      });
      expect(mockLifecycleProducer.addCreateTask).not.toHaveBeenCalled();
    });

    it('failed runtime 应 fail closed 且不得删除持久磁盘', async () => {
      const failedSession = buildSession({
        status: 'failed',
        runtimeHandle: 'container-old',
        workspacePath: '/workspace/',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        stoppedAt: new Date('2025-01-02T00:00:00.000Z'),
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'Persistent Sandbox',
        },
      });
      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([failedSession]),
      );
      mockRuntimeDriver.inspectRuntime.mockResolvedValueOnce({
        state: 'failed',
      });

      await expect(
        service.startSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).rejects.toBeInstanceOf(SandboxInvalidStateException);

      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.deleteRuntime).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addCreateTask).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addStartTask).not.toHaveBeenCalled();
    });
  });

  describe('stopSandbox', () => {
    it('persistent 沙箱应入队 stop task 而不是 destroy task', async () => {
      const session = buildSession({
        status: 'ready',
        runtimeHandle: 'container-abc',
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
        runtimeHandle: 'container-abc',
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
        runtimeHandle: 'container-stopped',
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
      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith(
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
        runtimeHandle: 'container-shared',
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
        runtimeHandle: 'container-shared',
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
        expect.objectContaining({ fencingToken: 1 }),
      );
      expect(
        mockWorkspaceService.syncFromSandboxContainer.mock
          .invocationCallOrder[0],
      ).toBeLessThan(updateChain.set.mock.invocationCallOrder[0]);
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

    it('已陈旧 runtime 为 stopped 时保留 handle 并返回', async () => {
      const staleSession = buildSession({
        status: 'ready',
        executionId: null,
        sandboxNodeId: null,
        runtimeHandle: 'container-gone',
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
        runtimeHandle: 'container-gone',
        workspacePath: null,
        stoppedAt: new Date('2025-01-03T00:00:00Z'),
      });

      db.select
        .mockReturnValueOnce(createSelectChainForList([staleSession]))
        .mockReturnValueOnce(createSelectChainForCount(1));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([stoppedSession]),
      );
      mockRuntimeDriver.healthCheck.mockResolvedValueOnce(false);

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
        runtimeHandle: 'container-conv',
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
          runtimeHandle: 'container-conv',
        }),
      );
    });

    it('session モードで lifecycleMode が明示的に session の場合も destroy する', async () => {
      const session = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        status: 'ready',
        runtimeHandle: 'container-conv',
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
        runtimeHandle: 'container-conv',
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
        expect.objectContaining({ fencingToken: 1 }),
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

  describe('生命周期与绑定边界不变量', () => {
    it('绑定规范化会剔除空身份、去重，并在多绑定时避免伪造单一节点归属', () => {
      const internals = service as unknown as {
        normalizeBinding(
          value: Record<string, unknown>,
        ): Record<string, string>;
        dedupeBindings(
          values: Array<Record<string, string | null>>,
        ): Array<Record<string, string>>;
        projectPersistentBindingState(values: Array<Record<string, string>>): {
          executionId: string | null;
          agentConversationId: string | null;
          sandboxNodeId: string | null;
        };
        buildPersistentConfig(
          config: SandboxConfig,
          values: Array<Record<string, string>>,
        ): SandboxConfig;
        shouldDetachPersistentBinding(
          candidate: Record<string, string>,
          target: Record<string, string>,
        ): boolean;
        describeBinding(value: Record<string, string>): string;
      };

      expect(
        internals.normalizeBinding({
          executionId: ' exec-1 ',
          agentConversationId: ' ',
          sandboxNodeId: null,
        }),
      ).toEqual({ executionId: 'exec-1' });
      const bindings = internals.dedupeBindings([
        { executionId: ' exec-1 ', sandboxNodeId: ' node-1 ' },
        { executionId: 'exec-1', sandboxNodeId: 'node-1' },
        { executionId: null, agentConversationId: null },
        { executionId: 'exec-1', sandboxNodeId: 'node-2' },
        { agentConversationId: 'conv-1' },
      ]);
      expect(bindings).toEqual([
        { executionId: ' exec-1 ', sandboxNodeId: ' node-1 ' },
        { executionId: 'exec-1', sandboxNodeId: 'node-2' },
        { agentConversationId: 'conv-1' },
      ]);
      expect(internals.projectPersistentBindingState([])).toEqual({
        executionId: null,
        agentConversationId: null,
        sandboxNodeId: null,
      });
      expect(internals.projectPersistentBindingState(bindings)).toEqual({
        executionId: null,
        agentConversationId: 'conv-1',
        sandboxNodeId: null,
      });
      expect(
        internals.buildPersistentConfig(
          { ...TEST_CONFIG, activeBindings: bindings },
          [],
        ),
      ).not.toHaveProperty('activeBindings');
      expect(
        internals.buildPersistentConfig(TEST_CONFIG, [
          { executionId: 'exec-1', sandboxNodeId: 'node-1' },
        ]),
      ).toMatchObject({
        activeBindings: [{ executionId: 'exec-1', sandboxNodeId: 'node-1' }],
      });
      expect(
        internals.shouldDetachPersistentBinding(
          { executionId: 'other', sandboxNodeId: 'node-1' },
          { executionId: 'exec-1', sandboxNodeId: 'node-1' },
        ),
      ).toBe(false);
      expect(
        internals.shouldDetachPersistentBinding(
          { executionId: 'exec-1', sandboxNodeId: 'node-2' },
          { executionId: 'exec-1', sandboxNodeId: 'node-1' },
        ),
      ).toBe(false);
      expect(
        internals.shouldDetachPersistentBinding(
          { executionId: 'exec-1', sandboxNodeId: 'node-2' },
          { executionId: 'exec-1' },
        ),
      ).toBe(true);
      expect(
        internals.describeBinding({
          executionId: 'exec-1',
          agentConversationId: 'conv-1',
          sandboxNodeId: 'node-1',
        }),
      ).toBe('execution exec-1 / sandbox node-1 / conversation conv-1');
      expect(internals.describeBinding({ executionId: 'exec-1' })).toBe(
        'execution exec-1',
      );
      expect(internals.describeBinding({ agentConversationId: 'conv-1' })).toBe(
        'conversation conv-1',
      );
    });

    it('legacy persistent binding、空配置与 lease TTL 均保持兼容且不扩大身份', () => {
      const internals = service as unknown as {
        getPersistentBindings(
          session: SandboxSession,
        ): Array<Record<string, string>>;
        projectPersistentBindingState(values: Array<Record<string, string>>): {
          executionId: string | null;
          agentConversationId: string | null;
          sandboxNodeId: string | null;
        };
        bindingsEqual(
          left: Record<string, string>,
          right: Record<string, string>,
        ): boolean;
        readRestoreWorkspaceId(config: SandboxConfig): string | null;
        resolveWorkspaceLeaseTtlMs(config: SandboxConfig): number;
      };

      expect(
        internals.getPersistentBindings(
          buildSession({
            executionId: null,
            agentConversationId: null,
            sandboxNodeId: null,
            config: TEST_CONFIG,
          }),
        ),
      ).toEqual([]);
      expect(
        internals.getPersistentBindings(
          buildSession({
            executionId: ' exec-1 ',
            agentConversationId: null,
            sandboxNodeId: ' node-1 ',
            config: { ...TEST_CONFIG, activeBindings: [] },
          }),
        ),
      ).toEqual([{ executionId: 'exec-1', sandboxNodeId: 'node-1' }]);
      expect(
        internals.getPersistentBindings(
          buildSession({
            config: {
              ...TEST_CONFIG,
              activeBindings: [
                { executionId: 'e1', sandboxNodeId: 'n1' },
                { executionId: 'e1', sandboxNodeId: 'n1' },
              ],
            },
          }),
        ),
      ).toEqual([{ executionId: 'e1', sandboxNodeId: 'n1' }]);
      expect(
        internals.projectPersistentBindingState([
          { executionId: 'e1', sandboxNodeId: 'n1' },
        ]),
      ).toEqual({
        executionId: 'e1',
        agentConversationId: null,
        sandboxNodeId: 'n1',
      });
      expect(
        internals.projectPersistentBindingState([
          { executionId: 'e1', sandboxNodeId: 'n1' },
          { executionId: 'e2', sandboxNodeId: 'n2' },
        ]),
      ).toEqual({
        executionId: null,
        agentConversationId: null,
        sandboxNodeId: null,
      });
      expect(
        internals.bindingsEqual({ executionId: 'e1' }, { executionId: 'e1' }),
      ).toBe(true);
      expect(
        internals.bindingsEqual(
          { executionId: 'e1' },
          { agentConversationId: 'c1' },
        ),
      ).toBe(false);
      expect(internals.readRestoreWorkspaceId(TEST_CONFIG)).toBeNull();
      expect(
        internals.readRestoreWorkspaceId({
          ...TEST_CONFIG,
          restoreWorkspaceId: ' workspace-1 ',
        }),
      ).toBe('workspace-1');
      expect(
        internals.resolveWorkspaceLeaseTtlMs({
          ...TEST_CONFIG,
          timeout: Number.NaN,
        }),
      ).toBe(61 * 60_000);
      expect(
        internals.resolveWorkspaceLeaseTtlMs({
          ...TEST_CONFIG,
          timeout: 0.01,
        }),
      ).toBe(5 * 60_000);
    });

    it('缺失会话的 stats/process/idle 操作均 fail closed 或保持无副作用', async () => {
      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]));

      await expect(
        service.getConversationSandboxStats(
          TEST_CONVERSATION_ID,
          TEST_TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(SandboxStatsUnavailableException);
      await expect(
        service.getConversationSandboxProcesses(
          TEST_CONVERSATION_ID,
          TEST_TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(SandboxProcessesUnavailableException);
      await service.scheduleConversationIdleAutoEnd(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );
      await service.cancelConversationIdleAutoEnd(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(
        mockLifecycleProducer.addConversationIdleEndCheckTask,
      ).not.toHaveBeenCalled();
      expect(
        mockLifecycleProducer.removeConversationIdleEndCheckTask,
      ).not.toHaveBeenCalled();
    });

    it('没有 conversation 绑定的 resource session 不应产生 idle 到期任务', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([
          buildSession({
            executionId: null,
            agentConversationId: null,
            sandboxNodeId: null,
            config: { ...TEST_CONFIG, lifecycleMode: 'persistent' },
          }),
        ]),
      );

      await service.scheduleConversationIdleAutoEnd(
        TEST_CONVERSATION_ID,
        TEST_TENANT_ID,
      );

      expect(
        mockLifecycleProducer.addConversationIdleEndCheckTask,
      ).not.toHaveBeenCalled();
    });

    it('事务中的生命周期任务只在 after-commit 执行', async () => {
      tenantTransactionMocks.hasActiveTenantTransaction.mockReturnValue(true);
      const callback = vi.fn().mockResolvedValue(undefined);
      const enqueue = service as unknown as {
        enqueueLifecycleTask(task: () => Promise<void>): Promise<void>;
      };

      await enqueue.enqueueLifecycleTask(callback);

      expect(callback).not.toHaveBeenCalled();
      expect(
        tenantTransactionMocks.registerAfterCommitHook,
      ).toHaveBeenCalledWith(callback);
    });

    it('找不到 execution session 时 destroy/release 均幂等且不入队', async () => {
      db.select
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]));

      await service.destroySandbox(TEST_EXECUTION_ID, TEST_TENANT_ID);
      await service.releaseExecutionSandbox(
        TEST_EXECUTION_ID,
        'sandbox-1',
        TEST_TENANT_ID,
      );

      expect(mockLifecycleProducer.addDestroyTask).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addStopTask).not.toHaveBeenCalled();
    });

    it('重复 stop 竞争失败时不重复入队，并返回数据库中的最新状态', async () => {
      const session = buildSession({ status: 'ready', runtimeHandle: null });
      const latest = buildSession({ status: 'stopping', runtimeHandle: null });
      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([session]))
        .mockReturnValueOnce(createSelectChainWithLimit([latest]));
      db.update.mockReturnValueOnce(createUpdateChainReturning([]));

      await expect(
        service.stopSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).resolves.toEqual(latest);

      expect(mockLifecycleProducer.addStopTask).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addDestroyTask).not.toHaveBeenCalled();
    });

    it('stop 拒绝终态；session stop 则只入队 destroy 且不伪造可选绑定', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([
          buildSession({ status: 'stopped', runtimeHandle: null }),
        ]),
      );
      await expect(
        service.stopSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).rejects.toBeInstanceOf(SandboxInvalidStateException);

      const resourceSession = buildSession({
        executionId: null,
        agentConversationId: TEST_CONVERSATION_ID,
        sandboxNodeId: null,
        status: 'creating',
        runtimeHandle: null,
        config: { ...TEST_CONFIG, lifecycleMode: 'session' },
      });
      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([resourceSession]))
        .mockReturnValueOnce(createSelectChainWithLimit([resourceSession]));
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([{ id: TEST_SESSION_ID }]),
      );

      await service.stopSandbox(TEST_SESSION_ID, TEST_TENANT_ID);

      expect(mockLifecycleProducer.addDestroyTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        tenantId: TEST_TENANT_ID,
        agentConversationId: TEST_CONVERSATION_ID,
      });
    });

    it('start 严格拒绝 session、活动状态、缺失 handle 与非 stopped manager 状态', async () => {
      const cases = [
        buildSession({
          status: 'stopped',
          runtimeHandle: 'r1',
          config: TEST_CONFIG,
        }),
        buildSession({
          status: 'ready',
          runtimeHandle: 'r1',
          config: { ...TEST_CONFIG, lifecycleMode: 'persistent' },
        }),
        buildSession({
          status: 'stopped',
          runtimeHandle: null,
          config: { ...TEST_CONFIG, lifecycleMode: 'persistent' },
        }),
        buildSession({
          status: 'stopped',
          runtimeHandle: 'r1',
          config: { ...TEST_CONFIG, lifecycleMode: 'persistent' },
        }),
      ];
      for (const session of cases) {
        db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      }
      mockRuntimeDriver.inspectRuntime.mockResolvedValueOnce({
        state: 'running',
      });

      await expect(
        service.startSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).rejects.toBeInstanceOf(SandboxNotPersistentException);
      await expect(
        service.startSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).rejects.toBeInstanceOf(SandboxInvalidStateException);
      await expect(
        service.startSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).rejects.toBeInstanceOf(SandboxInvalidStateException);
      await expect(
        service.startSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).rejects.toBeInstanceOf(SandboxInvalidStateException);
      expect(mockLifecycleProducer.addStartTask).not.toHaveBeenCalled();
    });

    it('delete 拒绝 session；活动 persistent 会先 stop，cleanup 失败也仍删除数据库记录', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([
          buildSession({ status: 'ready', config: TEST_CONFIG }),
        ]),
      );
      await expect(
        service.deleteSandbox(TEST_SESSION_ID, TEST_TENANT_ID),
      ).rejects.toBeInstanceOf(SandboxNotPersistentException);

      const persistent = buildSession({
        status: 'busy',
        runtimeHandle: 'r1',
        config: { ...TEST_CONFIG, lifecycleMode: 'persistent' },
      });
      const deleteWhere = vi.fn().mockResolvedValue(undefined);
      db.select.mockReturnValueOnce(createSelectChainWithLimit([persistent]));
      db.delete.mockReturnValue({ where: deleteWhere });
      mockRuntimeDriver.deleteRuntime.mockRejectedValueOnce('disk busy');

      await service.deleteSandbox(TEST_SESSION_ID, TEST_TENANT_ID);

      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('r1');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('r1', {
        removeVolumes: true,
      });
      expect(db.delete).toHaveBeenCalledTimes(2);
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('disk busy'),
      );
    });

    it('resource persistent 无 handle 删除时只清理调度与数据库', async () => {
      const persistent = buildSession({
        executionId: null,
        sandboxNodeId: null,
        status: 'failed',
        runtimeHandle: null,
        config: { ...TEST_CONFIG, lifecycleMode: 'persistent' },
      });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([persistent]));
      db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      await service.deleteSandbox(TEST_SESSION_ID, TEST_TENANT_ID);

      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.deleteRuntime).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.removeTimeoutCheckTask).toHaveBeenCalled();
      expect(
        mockLifecycleProducer.removeConversationIdleEndCheckTask,
      ).toHaveBeenCalled();
    });

    it('persistent attach 拒绝非持久、跨上下文占用和 stopping 状态', async () => {
      const attach = service as unknown as {
        attachPersistentSandbox(
          params: Record<string, unknown>,
        ): Promise<unknown>;
      };
      const baseParams = {
        executionId: TEST_EXECUTION_ID,
        sandboxNodeId: 'node-2',
        persistentSandboxId: TEST_SESSION_ID,
        tenantId: TEST_TENANT_ID,
      };
      db.select
        .mockReturnValueOnce(
          createSelectChainWithLimit([
            buildSession({ status: 'ready', config: TEST_CONFIG }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChainWithLimit([
            buildSession({
              status: 'ready',
              config: {
                ...TEST_CONFIG,
                lifecycleMode: 'persistent',
                activeBindings: [
                  { executionId: 'other-execution', sandboxNodeId: 'node-1' },
                ],
              },
            }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChainWithLimit([
            buildSession({
              status: 'stopping',
              config: {
                ...TEST_CONFIG,
                lifecycleMode: 'persistent',
                activeBindings: [
                  {
                    executionId: TEST_EXECUTION_ID,
                    sandboxNodeId: 'node-1',
                  },
                ],
              },
            }),
          ]),
        );

      await expect(
        attach.attachPersistentSandbox(baseParams),
      ).rejects.toBeInstanceOf(SandboxNotPersistentException);
      await expect(
        attach.attachPersistentSandbox(baseParams),
      ).rejects.toBeInstanceOf(SandboxInvalidStateException);
      await expect(
        attach.attachPersistentSandbox(baseParams),
      ).rejects.toBeInstanceOf(SandboxInvalidStateException);
    });

    it('ready resource 恢复 workspace 失败时必须释放刚取得的 lease 且不写绑定', async () => {
      const resource = buildSession({
        executionId: null,
        agentConversationId: null,
        sandboxNodeId: null,
        status: 'ready',
        runtimeHandle: 'r1',
        config: { ...TEST_CONFIG, lifecycleMode: 'persistent' },
      });
      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([resource]));
      mockWorkspaceService.restoreToSandbox.mockRejectedValueOnce(
        new Error('restore failed'),
      );

      await expect(
        service.createSandboxSession({
          agentConversationId: TEST_CONVERSATION_ID,
          sandboxNodeId: null,
          tenantId: TEST_TENANT_ID,
          config: {
            ...TEST_CONFIG,
            lifecycleMode: 'persistent',
            persistentSandboxId: TEST_SESSION_ID,
            restoreWorkspaceId: ' workspace-1 ',
          },
        }),
      ).rejects.toThrow('restore failed');

      expect(mockWorkspaceLeaseService.release).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({ fencingToken: 1 }),
      );
      expect(db.update).not.toHaveBeenCalled();
      expect(
        mockLifecycleProducer.upsertWorkspaceLeaseRenewal,
      ).not.toHaveBeenCalled();
    });

    it('runtime reconcile 在 grace window/健康 runtime 保持原状态，未知 manager 状态 fail closed', async () => {
      const reconcile = service as unknown as {
        reconcileUnavailableRuntimeSession(
          session: SandboxSession,
          options?: { force?: boolean },
        ): Promise<SandboxSession>;
      };
      const inactive = buildSession({ status: 'creating' });
      const noStart = buildSession({
        status: 'ready',
        runtimeHandle: 'r1',
        startedAt: null,
      });
      const recent = buildSession({
        status: 'busy',
        runtimeHandle: 'r1',
        startedAt: new Date(),
      });
      const healthy = buildSession({
        status: 'ready',
        runtimeHandle: 'r1',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      const unknownManagerState = buildSession({
        id: 'unknown-manager-state',
        status: 'ready',
        runtimeHandle: 'r2',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      const noHandle = buildSession({
        status: 'ready',
        runtimeHandle: null,
        startedAt: new Date(0),
      });

      await expect(
        reconcile.reconcileUnavailableRuntimeSession(inactive),
      ).resolves.toBe(inactive);
      await expect(
        reconcile.reconcileUnavailableRuntimeSession(noStart),
      ).resolves.toBe(noStart);
      await expect(
        reconcile.reconcileUnavailableRuntimeSession(recent),
      ).resolves.toBe(recent);
      await expect(
        reconcile.reconcileUnavailableRuntimeSession(noHandle, { force: true }),
      ).resolves.toBe(noHandle);
      mockRuntimeDriver.healthCheck.mockResolvedValueOnce(true);
      await expect(
        reconcile.reconcileUnavailableRuntimeSession(healthy),
      ).resolves.toBe(healthy);
      mockRuntimeDriver.healthCheck.mockResolvedValueOnce(false);
      mockRuntimeDriver.inspectRuntime.mockResolvedValueOnce({
        state: 'starting',
      });
      await expect(
        reconcile.reconcileUnavailableRuntimeSession(unknownManagerState, {
          force: true,
        }),
      ).rejects.toBeInstanceOf(SandboxInvalidStateException);
    });

    it('管理列表组合 status/lifecycle/binding 过滤并正确区分 conversation/resource', async () => {
      const conversation = buildSession({
        executionId: TEST_EXECUTION_ID,
        agentConversationId: TEST_CONVERSATION_ID,
        status: 'ready',
      });
      const listChain = createSelectChainForList([conversation]);
      db.select
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(createSelectChainForCount(1));

      const result = await service.listSandboxes(TEST_TENANT_ID, {
        page: 2,
        pageSize: 1,
        status: 'ready',
        lifecycleMode: 'persistent',
        bindingType: 'conversation',
      });

      expect(result.data[0]?.bindingType).toBe('conversation');
      expect(result.meta).toEqual({
        page: 2,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      });
      const whereClause = listChain.from().where.mock.calls[0]?.[0];
      const rendered = renderSql(whereClause).toLowerCase();
      expect(rendered).toContain('"sandbox_sessions"."status"');
      expect(renderSqlWithParams(whereClause).params).toEqual(
        expect.arrayContaining(['ready', 'persistent']),
      );
      expect(rendered).toContain(
        '"sandbox_sessions"."agent_conversation_id" is not null',
      );
    });

    it('execution binding 过滤和空 count 均返回稳定分页元数据', async () => {
      const listChain = createSelectChainForList([]);
      const countChain = createSelectChainForCount(0);
      countChain.from().where.mockResolvedValueOnce([{ total: null }]);
      db.select.mockReturnValueOnce(listChain).mockReturnValueOnce(countChain);

      const result = await service.listSandboxes(TEST_TENANT_ID, {
        page: 1,
        pageSize: 10,
        bindingType: 'execution',
      });

      expect(result).toEqual({
        data: [],
        meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      });
      expect(
        renderSql(listChain.from().where.mock.calls[0]?.[0]).toLowerCase(),
      ).toContain('"sandbox_sessions"."execution_id" is not null');
    });

    it('createPersistentSandbox 固定 persistent timeout 并保留显式 idle 配置', async () => {
      const session = buildSession({
        executionId: null,
        sandboxNodeId: null,
        config: {
          ...TEST_CONFIG,
          lifecycleMode: 'persistent',
          name: 'resource',
        },
      });
      db.insert.mockReturnValueOnce(createInsertChainReturning([session]));

      await service.createPersistentSandbox(TEST_TENANT_ID, {
        name: 'resource',
        cpu: 2,
        memory: 1024,
        disk: 5,
        conversationIdleAutoEndMinutes: 7,
      });

      expect(mockLifecycleProducer.addCreateTask).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        tenantId: TEST_TENANT_ID,
        config: expect.objectContaining({
          lifecycleMode: 'persistent',
          timeout: 24,
          conversationIdleAutoEndMinutes: 7,
          name: 'resource',
        }),
      });
    });

    it('getSessionById 与 terminal runtime 读取均映射为领域错误', async () => {
      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(
          createSelectChainWithLimit([
            buildSession({ status: 'failed', runtimeHandle: 'r1' }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChainWithLimit([
            buildSession({ status: 'stopped', runtimeHandle: 'r1' }),
          ]),
        );

      await expect(
        service.getSessionById(TEST_SESSION_ID),
      ).rejects.toBeInstanceOf(SandboxNotFoundException);
      await expect(
        service.getRuntimeStats(TEST_SESSION_ID),
      ).rejects.toBeInstanceOf(SandboxStatsUnavailableException);
      await expect(
        service.getConversationSandboxProcesses(
          TEST_CONVERSATION_ID,
          TEST_TENANT_ID,
        ),
      ).rejects.toBeInstanceOf(SandboxProcessesUnavailableException);
      expect(mockRuntimeDriver.getRuntimeStats).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.listRuntimeProcesses).not.toHaveBeenCalled();
    });
  });
});
