import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

import type { SandboxConfig } from '../../../database/schema';

const mockRuntimeDriver = {
  createRuntime: vi.fn().mockResolvedValue({ runtimeHandle: 'c-123' }),
  startRuntime: vi.fn().mockResolvedValue(undefined),
  stopRuntime: vi.fn().mockResolvedValue(undefined),
  deleteRuntime: vi.fn().mockResolvedValue(undefined),
  attachLogs: vi.fn().mockResolvedValue(undefined),
  getArchive: vi
    .fn()
    .mockResolvedValue(Readable.from(Buffer.from('fake-archive'))),
};

const mockSandboxService = {
  getSandboxSession: vi.fn(),
  findByConversationId: vi.fn(),
  getSessionById: vi.fn(),
};

const mockLifecycleProducer = {
  addTimeoutCheckTask: vi.fn().mockResolvedValue({ id: 'timeout-job' }),
  addConversationIdleEndCheckTask: vi.fn().mockResolvedValue({
    id: 'idle-end-job',
  }),
  removeTimeoutCheckTask: vi.fn().mockResolvedValue(undefined),
  removeConversationIdleEndCheckTask: vi.fn().mockResolvedValue(undefined),
  upsertWorkspaceLeaseRenewal: vi.fn().mockResolvedValue(undefined),
  removeWorkspaceLeaseRenewal: vi.fn().mockResolvedValue(undefined),
};

const mockStorageService = {
  upload: vi.fn().mockResolvedValue(undefined),
};
const mockModuleRef = {
  get: vi.fn(),
};
const mockWorkspaceLeaseService = {
  acquire: vi.fn().mockResolvedValue({
    workspaceId: 'workspace-1',
    sandboxSessionId: 's1',
    fencingToken: 1,
  }),
  renewOwned: vi.fn().mockResolvedValue({
    workspaceId: 'workspace-1',
    sandboxSessionId: 's1',
    fencingToken: 1,
  }),
  assertHeld: vi.fn().mockResolvedValue(undefined),
  release: vi.fn().mockResolvedValue(undefined),
};

const mockUpdate = vi.fn().mockReturnThis();
const mockSet = vi.fn().mockReturnThis();
const mockWhere = vi.fn().mockReturnThis();
const mockReturning = vi
  .fn()
  .mockResolvedValue([{ id: 'sandbox-session-row' }]);
const mockInsert = vi.fn().mockReturnThis();
const mockValues = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn();
const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockSelectWhere = vi.fn();
const mockLimit = vi.fn();

const mockTenantDb = {
  update: mockUpdate,
  insert: mockInsert,
  delete: mockDelete,
  select: mockSelect,
  execute: vi.fn().mockResolvedValue({ rows: [] }),
};
mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ returning: mockReturning });
mockInsert.mockReturnValue({ values: mockValues });
mockDelete.mockReturnValue({ where: mockDeleteWhere });
mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockSelectWhere });
mockSelectWhere.mockReturnValue({ limit: mockLimit });
// Default: no lifecycleMode → defaults to 'session' mode
mockLimit.mockResolvedValue([
  { config: { cpu: 1, memory: 512, disk: 2, timeout: 2 } },
]);

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    (_db: any, _tenantId: string, op: (dbClient: any) => Promise<any>) =>
      op(mockTenantDb),
  ),
}));

vi.mock('@nestjs/bullmq', () => ({
  Processor: () => () => {},
  OnWorkerEvent: () => () => {},
  InjectQueue: () => () => {},
  WorkerHost: class {},
}));

vi.mock('@nestjs/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/common')>();
  return {
    ...actual,
    Inject: () => () => {},
    Logger: class MockLogger {
      log = vi.fn();
      warn = vi.fn();
      error = vi.fn();
    },
  };
});

import { SandboxLifecycleWorker } from '../sandbox-lifecycle.worker';
import {
  SandboxCreationException,
  SandboxRuntimeNotFoundException,
  SandboxTimeoutException,
} from '../sandbox.exceptions';

const DEFAULT_CONFIG: SandboxConfig = {
  cpu: 2,
  memory: 1024,
  disk: 5,
  timeout: 4,
};

function createJob(data: Record<string, unknown>) {
  return { id: 'job-1', data } as any;
}

describe('SandboxLifecycleWorker', () => {
  let worker: SandboxLifecycleWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
    mockReturning.mockResolvedValue([{ id: 'sandbox-session-row' }]);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockDeleteWhere.mockResolvedValue(undefined);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([
      { config: { cpu: 1, memory: 512, disk: 2, timeout: 2 } },
    ]);
    mockTenantDb.execute.mockResolvedValue({ rows: [] });
    mockModuleRef.get.mockReset();
    mockModuleRef.get.mockReturnValue(undefined);

    worker = new SandboxLifecycleWorker(
      {} as any,
      mockModuleRef as any,
      mockRuntimeDriver as any,
      mockSandboxService as any,
      mockLifecycleProducer as any,
      mockStorageService as any,
      mockWorkspaceLeaseService as any,
    );
  });
  it('workspace lease scheduler 应周期续租运行中的 sandbox', async () => {
    mockSandboxService.getSessionById.mockResolvedValueOnce({
      id: 's1',
      status: 'ready',
      config: { ...DEFAULT_CONFIG, restoreWorkspaceId: 'ws-1' },
    });

    await worker.process(
      createJob({
        jobType: 'workspace_lease_renew',
        sessionId: 's1',
        tenantId: 't1',
      }),
    );

    expect(mockWorkspaceLeaseService.renewOwned).toHaveBeenCalledWith(
      't1',
      'ws-1',
      's1',
      2 * 60_000,
    );
  });

  describe('create job', () => {
    it('应创建容器、更新状态为 ready、启动日志收集、设置超时检查', async () => {
      await worker.process(
        createJob({
          jobType: 'create',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          config: DEFAULT_CONFIG,
        }),
      );

      expect(mockRuntimeDriver.createRuntime).toHaveBeenCalledWith(
        's1',
        DEFAULT_CONFIG,
        { piConfigInput: undefined, conversationId: undefined },
      );
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeHandle: 'c-123',
          status: 'ready',
          workspacePath: '/workspace/',
        }),
      );
      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Sandbox runtime created' }),
      );
      expect(mockRuntimeDriver.attachLogs).toHaveBeenCalledWith(
        'c-123',
        expect.any(Function),
      );
      expect(mockLifecycleProducer.addTimeoutCheckTask).toHaveBeenCalledWith({
        sessionId: 's1',
        executionId: 'e1',
        tenantId: 't1',
        delayMs: 4 * 60 * 60 * 1000,
      });
    });

    it('conversation create 应携带 agentConversationId 设置超时检查', async () => {
      await worker.process(
        createJob({
          jobType: 'create',
          sessionId: 's-conv',
          agentConversationId: 'conv-1',
          tenantId: 't1',
          config: DEFAULT_CONFIG,
        }),
      );

      expect(mockLifecycleProducer.addTimeoutCheckTask).toHaveBeenCalledWith({
        sessionId: 's-conv',
        agentConversationId: 'conv-1',
        tenantId: 't1',
        delayMs: 4 * 60 * 60 * 1000,
      });
    });

    it('config.timeoutSeconds 存在时应优先按秒调度超时检查', async () => {
      await worker.process(
        createJob({
          jobType: 'create',
          sessionId: 's-seconds',
          agentConversationId: 'conv-seconds',
          tenantId: 't1',
          config: {
            ...DEFAULT_CONFIG,
            timeout: 1,
            timeoutSeconds: 300,
          },
        }),
      );

      expect(mockLifecycleProducer.addTimeoutCheckTask).toHaveBeenCalledWith({
        sessionId: 's-seconds',
        agentConversationId: 'conv-seconds',
        tenantId: 't1',
        delayMs: 300 * 1000,
      });
    });

    it('timeout<=0 时不应调度超时检查', async () => {
      await worker.process(
        createJob({
          jobType: 'create',
          sessionId: 's-no-timeout',
          agentConversationId: 'conv-no-timeout',
          tenantId: 't1',
          config: {
            ...DEFAULT_CONFIG,
            timeout: 0,
          },
        }),
      );

      expect(mockLifecycleProducer.removeTimeoutCheckTask).toHaveBeenCalledWith(
        's-no-timeout',
      );
      expect(
        mockLifecycleProducer.addTimeoutCheckTask,
      ).not.toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 's-no-timeout',
        }),
      );
    });

    it('session 已离开 creating 状态时应回收新建容器且不覆盖为 ready', async () => {
      mockReturning.mockResolvedValueOnce([]);

      await worker.process(
        createJob({
          jobType: 'create',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          config: DEFAULT_CONFIG,
        }),
      );

      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
      expect(mockRuntimeDriver.attachLogs).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addTimeoutCheckTask).not.toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalled();
    });

    it('session 模式容器创建失败时应保留 failed 状态并记录日志', async () => {
      mockRuntimeDriver.createRuntime.mockRejectedValueOnce(
        new Error('image not found'),
      );

      await expect(
        worker.process(
          createJob({
            jobType: 'create',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
            config: DEFAULT_CONFIG,
          }),
        ),
      ).rejects.toThrow('image not found');

      expect(mockDeleteWhere).not.toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(mockInsert).toHaveBeenCalled();
    });

    it('persistent 模式容器创建失败时应标记为 failed 并记录日志', async () => {
      mockRuntimeDriver.createRuntime.mockRejectedValueOnce(
        new Error('image not found'),
      );

      const persistentConfig = {
        ...DEFAULT_CONFIG,
        lifecycleMode: 'persistent' as const,
      };

      await expect(
        worker.process(
          createJob({
            jobType: 'create',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
            config: persistentConfig,
          }),
        ),
      ).rejects.toThrow('image not found');

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(mockInsert).toHaveBeenCalled();
    });

    it('config 缺失时应抛出 SandboxCreationException', async () => {
      await expect(
        worker.process(
          createJob({
            jobType: 'create',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
          }),
        ),
      ).rejects.toThrow(SandboxCreationException);
    });

    it('config.restoreWorkspaceId 存在时应在创建后恢复工作区', async () => {
      const mockWorkspaceService = {
        restoreToSandbox: vi.fn().mockResolvedValue(undefined),
      };
      const mockModuleRef = {
        get: vi.fn().mockReturnValue(mockWorkspaceService),
      };

      const workerWithModuleRef = new SandboxLifecycleWorker(
        {} as any,
        mockModuleRef as any,
        mockRuntimeDriver as any,
        mockSandboxService as any,
        mockLifecycleProducer as any,
        mockStorageService as any,
        mockWorkspaceLeaseService as any,
      );

      await workerWithModuleRef.process(
        createJob({
          jobType: 'create',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          config: { ...DEFAULT_CONFIG, restoreWorkspaceId: 'ws-1' },
        }),
      );

      expect(mockModuleRef.get).toHaveBeenCalled();
      expect(mockWorkspaceService.restoreToSandbox).toHaveBeenCalledWith(
        'ws-1',
        'c-123',
        't1',
      );
    });

    it('workspace lease 已被占用时应拒绝创建运行时', async () => {
      mockWorkspaceLeaseService.acquire.mockRejectedValueOnce(
        new Error('workspace lease conflict'),
      );

      await expect(
        worker.process(
          createJob({
            jobType: 'create',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
            config: { ...DEFAULT_CONFIG, restoreWorkspaceId: 'ws-1' },
          }),
        ),
      ).rejects.toThrow('workspace lease conflict');

      expect(mockRuntimeDriver.createRuntime).not.toHaveBeenCalled();
    });

    it('工作区恢复失败时应使沙箱创建失败并释放 lease', async () => {
      const mockWorkspaceService = {
        restoreToSandbox: vi
          .fn()
          .mockRejectedValue(new Error('Workspace restore failed')),
      };
      const mockModuleRef = {
        get: vi.fn().mockReturnValue(mockWorkspaceService),
      };

      const workerWithModuleRef = new SandboxLifecycleWorker(
        {} as any,
        mockModuleRef as any,
        mockRuntimeDriver as any,
        mockSandboxService as any,
        mockLifecycleProducer as any,
        mockStorageService as any,
        mockWorkspaceLeaseService as any,
      );

      await expect(
        workerWithModuleRef.process(
          createJob({
            jobType: 'create',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
            config: { ...DEFAULT_CONFIG, restoreWorkspaceId: 'ws-1' },
          }),
        ),
      ).rejects.toThrow('Workspace restore failed');

      expect(mockWorkspaceService.restoreToSandbox).toHaveBeenCalled();
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalled();
      expect(mockWorkspaceLeaseService.release).toHaveBeenCalled();
      expect(mockRuntimeDriver.attachLogs).not.toHaveBeenCalled();
    });
  });

  describe('destroy job', () => {
    it('session 模式应停止并删除容器、清除数据库记录', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
        }),
      );

      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
      expect(mockSelect).toHaveBeenCalled();
      expect(mockDeleteWhere).toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('persistent 模式应停止容器、更新状态为 stopped 并记录日志', async () => {
      mockLimit.mockResolvedValueOnce([
        {
          config: {
            cpu: 1,
            memory: 512,
            disk: 2,
            timeout: 24,
            lifecycleMode: 'persistent',
          },
        },
      ]);

      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
        }),
      );

      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'stopped' }),
      );
      expect(mockInsert).toHaveBeenCalled();
    });

    it('无 runtimeHandle 时应仅清除数据库记录', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
        }),
      );

      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.deleteRuntime).not.toHaveBeenCalled();
      expect(mockDeleteWhere).toHaveBeenCalled();
    });

    it('有 persistencePath 时应在删除前同步 workspace 到 MinIO', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
          persistencePath: '/outputs/result',
        }),
      );

      expect(mockRuntimeDriver.getArchive).toHaveBeenCalledWith(
        'c-123',
        '/workspace/',
      );
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/t1/outputs/result/workspace.tar',
        expect.any(Readable),
        undefined,
        'application/x-tar',
      );
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
    });

    it('无 persistencePath 时不应同步 workspace', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
        }),
      );

      expect(mockRuntimeDriver.getArchive).not.toHaveBeenCalled();
      expect(mockStorageService.upload).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
    });

    it('restoreWorkspaceId 存在时应先回写原工作区再销毁', async () => {
      const mockWorkspaceService = {
        syncFromSandboxContainer: vi.fn().mockResolvedValue(undefined),
      };
      const workerWithModuleRef = new SandboxLifecycleWorker(
        {} as any,
        { get: vi.fn().mockReturnValue(mockWorkspaceService) } as any,
        mockRuntimeDriver as any,
        mockSandboxService as any,
        mockLifecycleProducer as any,
        mockStorageService as any,
        mockWorkspaceLeaseService as any,
      );
      mockLimit.mockResolvedValueOnce([
        {
          config: {
            ...DEFAULT_CONFIG,
            restoreWorkspaceId: 'ws-1',
          },
        },
      ]);

      await workerWithModuleRef.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
        }),
      );

      expect(
        mockWorkspaceService.syncFromSandboxContainer,
      ).toHaveBeenCalledWith(
        'ws-1',
        'c-123',
        't1',
        expect.objectContaining({ fencingToken: 1 }),
      );
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
    });

    it('workspace 同步失败时不应阻止销毁流程', async () => {
      mockRuntimeDriver.getArchive.mockRejectedValueOnce(
        new Error('archive failed'),
      );

      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
          persistencePath: '/outputs/result',
        }),
      );

      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
      expect(mockDeleteWhere).toHaveBeenCalled();
    });

    it('已包含租户前缀的 persistencePath 不应重复拼接', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
          persistencePath: 'tenants/t1/sandboxes/custom/workspace.tar',
        }),
      );

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/t1/sandboxes/custom/workspace.tar',
        expect.any(Readable),
        undefined,
        'application/x-tar',
      );
    });

    it('conversation destroy 缺少 executionId 时也应完成销毁', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's-conv',
          agentConversationId: 'conv-1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
        }),
      );

      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
      expect(mockDeleteWhere).toHaveBeenCalled();
    });
  });

  describe('start job', () => {
    it('应启动已有容器、更新状态为 ready 并重新设置超时检查', async () => {
      await worker.process(
        createJob({
          jobType: 'start',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
          config: DEFAULT_CONFIG,
        }),
      );

      expect(mockRuntimeDriver.startRuntime).toHaveBeenCalledWith('c-123');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready',
          stoppedAt: null,
          workspacePath: '/workspace/',
        }),
      );
      expect(mockLifecycleProducer.addTimeoutCheckTask).toHaveBeenCalledWith({
        sessionId: 's1',
        executionId: 'e1',
        tenantId: 't1',
        delayMs: 4 * 60 * 60 * 1000,
      });
      expect(mockInsert).toHaveBeenCalled();
    });

    it('manager 404 时应保留 runtime handle 并失败收口', async () => {
      mockRuntimeDriver.startRuntime.mockRejectedValueOnce(
        new SandboxRuntimeNotFoundException(),
      );

      await expect(
        worker.process(
          createJob({
            jobType: 'start',
            sessionId: 's1',
            agentConversationId: 'conv-1',
            tenantId: 't1',
            runtimeHandle: 'c-missing',
            config: DEFAULT_CONFIG,
          }),
        ),
      ).rejects.toThrow(SandboxRuntimeNotFoundException);

      expect(mockRuntimeDriver.createRuntime).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.deleteRuntime).not.toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(mockRuntimeDriver.attachLogs).not.toHaveBeenCalled();
    });

    it('缺少 runtimeHandle 时应抛出异常', async () => {
      await expect(
        worker.process(
          createJob({
            jobType: 'start',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
            config: DEFAULT_CONFIG,
          }),
        ),
      ).rejects.toThrow(SandboxCreationException);
    });
  });

  describe('stop job', () => {
    it('persistent 模式应停止容器但不删除，并更新状态为 stopped', async () => {
      await worker.process(
        createJob({
          jobType: 'stop',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
          config: {
            ...DEFAULT_CONFIG,
            lifecycleMode: 'persistent',
          },
        }),
      );

      expect(mockLifecycleProducer.removeTimeoutCheckTask).toHaveBeenCalledWith(
        's1',
      );
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).not.toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'stopped',
          stoppedAt: expect.any(Date),
        }),
      );
      expect(mockInsert).toHaveBeenCalled();
    });

    it('restoreWorkspaceId 存在时应在停止前回写原工作区', async () => {
      const mockWorkspaceService = {
        syncFromSandboxContainer: vi.fn().mockResolvedValue(undefined),
      };
      const workerWithModuleRef = new SandboxLifecycleWorker(
        {} as any,
        { get: vi.fn().mockReturnValue(mockWorkspaceService) } as any,
        mockRuntimeDriver as any,
        mockSandboxService as any,
        mockLifecycleProducer as any,
        mockStorageService as any,
        mockWorkspaceLeaseService as any,
      );

      await workerWithModuleRef.process(
        createJob({
          jobType: 'stop',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          runtimeHandle: 'c-123',
          config: {
            ...DEFAULT_CONFIG,
            lifecycleMode: 'persistent',
            restoreWorkspaceId: 'ws-1',
          },
        }),
      );

      expect(
        mockWorkspaceService.syncFromSandboxContainer,
      ).toHaveBeenCalledWith(
        'ws-1',
        'c-123',
        't1',
        expect.objectContaining({ fencingToken: 1 }),
      );
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
    });
  });

  describe('timeout_check job', () => {
    it('session 模式会话仍活跃时应强制停止、删除记录并级联失败 workflow', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's1',
        executionId: 'e1',
        status: 'ready',
        runtimeHandle: 'c-123',
        config: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
      });

      await expect(
        worker.process(
          createJob({
            jobType: 'timeout_check',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
          }),
        ),
      ).rejects.toThrow(SandboxTimeoutException);

      expect(mockSandboxService.getSessionById).toHaveBeenCalledWith('s1');
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
      // Session-mode: sandbox row is deleted, not updated
      expect(mockDeleteWhere).toHaveBeenCalled();
      // Execution steps and workflow are still updated to failed
      const updatePayloads = mockSet.mock.calls.map(([payload]) => payload);
      expect(updatePayloads).toContainEqual(
        expect.objectContaining({
          status: 'failed',
          completedAt: expect.any(Date),
          errorMessage: { message: 'sandbox_timeout' },
        }),
      );
      expect(updatePayloads).toContainEqual(
        expect.objectContaining({
          status: 'failed',
          failedAt: expect.any(Date),
          errorMessage: { message: 'sandbox_timeout' },
        }),
      );
      // Session-mode: no log insertion
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('persistent 模式 timeout 应标记为 stopped 并记录日志', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's1',
        executionId: 'e1',
        status: 'ready',
        runtimeHandle: 'c-123',
        config: {
          cpu: 1,
          memory: 512,
          disk: 2,
          timeout: 24,
          lifecycleMode: 'persistent',
        },
      });

      await expect(
        worker.process(
          createJob({
            jobType: 'timeout_check',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
          }),
        ),
      ).rejects.toThrow(SandboxTimeoutException);

      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).not.toHaveBeenCalled();
      const updatePayloads = mockSet.mock.calls.map(([payload]) => payload);
      expect(updatePayloads).toContainEqual(
        expect.objectContaining({
          status: 'stopped',
          stoppedAt: expect.any(Date),
        }),
      );
      expect(mockInsert).toHaveBeenCalled();
    });

    it('resource persistent sandbox timeout 应自动停止且不抛出失败', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's-resource',
        status: 'ready',
        runtimeHandle: 'c-123',
        executionId: null,
        agentConversationId: null,
        sandboxNodeId: null,
        config: {
          cpu: 1,
          memory: 512,
          disk: 2,
          timeout: 24,
          lifecycleMode: 'persistent',
        },
      });

      await expect(
        worker.process(
          createJob({
            jobType: 'timeout_check',
            sessionId: 's-resource',
            tenantId: 't1',
          }),
        ),
      ).resolves.toBeUndefined();

      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).not.toHaveBeenCalled();

      const updatePayloads = mockSet.mock.calls.map(([payload]) => payload);
      expect(updatePayloads).toContainEqual(
        expect.objectContaining({
          status: 'stopped',
          stoppedAt: expect.any(Date),
        }),
      );
      expect(
        updatePayloads.some(
          (payload) =>
            payload &&
            typeof payload === 'object' &&
            'failedAt' in payload &&
            'errorMessage' in payload,
        ),
      ).toBe(false);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('会话已停止时应跳过处理', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's1',
        status: 'stopped',
        runtimeHandle: 'c-123',
      });

      await worker.process(
        createJob({
          jobType: 'timeout_check',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
        }),
      );

      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
    });

    it('会话不存在时应跳过处理', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce(null);

      await worker.process(
        createJob({
          jobType: 'timeout_check',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
        }),
      );

      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
    });

    it('conversation timeout 应只停止 sandbox 且不级联失败 workflow', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's-conv',
        agentConversationId: 'conv-1',
        status: 'ready',
        runtimeHandle: 'c-123',
        config: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
      });

      await expect(
        worker.process(
          createJob({
            jobType: 'timeout_check',
            sessionId: 's-conv',
            agentConversationId: 'conv-1',
            tenantId: 't1',
          }),
        ),
      ).resolves.toBeUndefined();

      expect(mockSandboxService.getSessionById).toHaveBeenCalledWith('s-conv');
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
      const updatePayloads = mockSet.mock.calls.map(([payload]) => payload);
      expect(
        updatePayloads.some(
          (payload) =>
            payload &&
            typeof payload === 'object' &&
            'completedAt' in payload &&
            'errorMessage' in payload,
        ),
      ).toBe(false);
      expect(
        updatePayloads.some(
          (payload) =>
            payload &&
            typeof payload === 'object' &&
            'failedAt' in payload &&
            'errorMessage' in payload,
        ),
      ).toBe(false);
    });

    it('timeout 时有 persistencePath 应先归档 workspace 再销毁', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's1',
        executionId: 'e1',
        status: 'ready',
        runtimeHandle: 'c-123',
        config: {
          cpu: 1,
          memory: 512,
          disk: 2,
          timeout: 2,
          persistencePath: '/outputs/result',
        },
      });

      await expect(
        worker.process(
          createJob({
            jobType: 'timeout_check',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
          }),
        ),
      ).rejects.toThrow(SandboxTimeoutException);

      expect(mockRuntimeDriver.getArchive).toHaveBeenCalledWith(
        'c-123',
        '/workspace/',
      );
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/t1/outputs/result/workspace.tar',
        expect.any(Readable),
        undefined,
        'application/x-tar',
      );
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
    });

    it('timeout 归档失败时应警告但仍然销毁沙箱', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's1',
        executionId: 'e1',
        status: 'ready',
        runtimeHandle: 'c-123',
        config: {
          cpu: 1,
          memory: 512,
          disk: 2,
          timeout: 2,
          persistencePath: '/outputs/result',
        },
      });

      mockRuntimeDriver.getArchive.mockRejectedValueOnce(
        new Error('archive stream failed'),
      );

      await expect(
        worker.process(
          createJob({
            jobType: 'timeout_check',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
          }),
        ),
      ).rejects.toThrow(SandboxTimeoutException);

      expect(mockRuntimeDriver.getArchive).toHaveBeenCalledWith(
        'c-123',
        '/workspace/',
      );
      expect(mockStorageService.upload).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
    });

    it('timeout 时无 persistencePath 不应尝试归档', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's1',
        executionId: 'e1',
        status: 'ready',
        runtimeHandle: 'c-123',
        config: { cpu: 1, memory: 512, disk: 2, timeout: 2 },
      });

      await expect(
        worker.process(
          createJob({
            jobType: 'timeout_check',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
          }),
        ),
      ).rejects.toThrow(SandboxTimeoutException);

      expect(mockRuntimeDriver.getArchive).not.toHaveBeenCalled();
      expect(mockStorageService.upload).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
    });

    it('restoreWorkspaceId 存在时应在 timeout 前回写原工作区', async () => {
      const mockWorkspaceService = {
        syncFromSandboxContainer: vi.fn().mockResolvedValue(undefined),
      };
      const workerWithModuleRef = new SandboxLifecycleWorker(
        {} as any,
        { get: vi.fn().mockReturnValue(mockWorkspaceService) } as any,
        mockRuntimeDriver as any,
        mockSandboxService as any,
        mockLifecycleProducer as any,
        mockStorageService as any,
        mockWorkspaceLeaseService as any,
      );
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's1',
        executionId: 'e1',
        status: 'ready',
        runtimeHandle: 'c-123',
        config: {
          cpu: 1,
          memory: 512,
          disk: 2,
          timeout: 2,
          restoreWorkspaceId: 'ws-1',
        },
      });

      await expect(
        workerWithModuleRef.process(
          createJob({
            jobType: 'timeout_check',
            sessionId: 's1',
            executionId: 'e1',
            tenantId: 't1',
          }),
        ),
      ).rejects.toThrow(SandboxTimeoutException);

      expect(
        mockWorkspaceService.syncFromSandboxContainer,
      ).toHaveBeenCalledWith(
        'ws-1',
        'c-123',
        't1',
        expect.objectContaining({ fencingToken: 1 }),
      );
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
      expect(mockRuntimeDriver.deleteRuntime).toHaveBeenCalledWith('c-123', {
        removeVolumes: true,
      });
    });

    it('conversation timeout 时有 persistencePath 应归档 workspace', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's-conv',
        agentConversationId: 'conv-1',
        status: 'ready',
        runtimeHandle: 'c-123',
        config: {
          cpu: 1,
          memory: 512,
          disk: 2,
          timeout: 2,
          persistencePath: '/conv-outputs',
        },
      });

      await expect(
        worker.process(
          createJob({
            jobType: 'timeout_check',
            sessionId: 's-conv',
            agentConversationId: 'conv-1',
            tenantId: 't1',
          }),
        ),
      ).resolves.toBeUndefined();

      expect(mockRuntimeDriver.getArchive).toHaveBeenCalledWith(
        'c-123',
        '/workspace/',
      );
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/t1/conv-outputs/workspace.tar',
        expect.any(Readable),
        undefined,
        'application/x-tar',
      );
      expect(mockRuntimeDriver.stopRuntime).toHaveBeenCalledWith('c-123');
    });
  });

  describe('conversation_idle_end_check job', () => {
    function createSelectWhereChain(result: unknown[]) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(result),
        }),
      };
    }

    function createSelectOrderByChain(result: unknown[]) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(result),
          }),
        }),
      };
    }

    it('所有绑定对话都空闲且无未处理消息时，应自动 end 对话', async () => {
      const endConversation = vi.fn().mockResolvedValue(undefined);
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's-conv',
        status: 'ready',
        executionId: null,
        sandboxNodeId: null,
        agentConversationId: 'conv-1',
        config: {
          ...DEFAULT_CONFIG,
          conversationIdleAutoEndMinutes: 12,
        },
      });
      mockModuleRef.get.mockImplementation((token: unknown) => {
        if (
          token &&
          typeof token === 'function' &&
          token.name === 'AgentConversationService'
        ) {
          return { end: endConversation };
        }

        if (
          token &&
          typeof token === 'function' &&
          token.name === 'AgentExecutionService'
        ) {
          return { getActiveRun: vi.fn().mockReturnValue(undefined) };
        }

        return undefined;
      });
      mockSelect
        .mockReturnValueOnce(
          createSelectWhereChain([
            {
              id: 'conv-1',
              status: 'active',
              metadata: {
                execution: {
                  runningState: 'idle',
                  lastProcessedMessageId: 'msg-1',
                },
              },
            },
          ]),
        )
        .mockReturnValueOnce(
          createSelectOrderByChain([
            {
              conversationId: 'conv-1',
              id: 'msg-1',
              createdAt: new Date('2026-04-04T00:00:00.000Z'),
            },
          ]),
        );

      await worker.process(
        createJob({
          jobType: 'conversation_idle_end_check',
          sessionId: 's-conv',
          tenantId: 't1',
        }),
      );

      expect(endConversation).toHaveBeenCalledWith('conv-1');
      expect(
        mockLifecycleProducer.addConversationIdleEndCheckTask,
      ).not.toHaveBeenCalled();
    });

    it('仍有未处理消息时不应结束对话', async () => {
      const endConversation = vi.fn().mockResolvedValue(undefined);
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's-conv',
        status: 'ready',
        executionId: null,
        sandboxNodeId: null,
        agentConversationId: 'conv-1',
        config: {
          ...DEFAULT_CONFIG,
          conversationIdleAutoEndMinutes: 12,
        },
      });
      mockModuleRef.get.mockImplementation((token: unknown) => {
        if (
          token &&
          typeof token === 'function' &&
          token.name === 'AgentConversationService'
        ) {
          return { end: endConversation };
        }

        if (
          token &&
          typeof token === 'function' &&
          token.name === 'AgentExecutionService'
        ) {
          return { getActiveRun: vi.fn().mockReturnValue(undefined) };
        }

        return undefined;
      });
      mockSelect
        .mockReturnValueOnce(
          createSelectWhereChain([
            {
              id: 'conv-1',
              status: 'active',
              metadata: {
                execution: {
                  runningState: 'idle',
                  lastProcessedMessageId: 'msg-1',
                },
              },
            },
          ]),
        )
        .mockReturnValueOnce(
          createSelectOrderByChain([
            {
              conversationId: 'conv-1',
              id: 'msg-2',
              createdAt: new Date('2026-04-04T00:01:00.000Z'),
            },
          ]),
        );

      await worker.process(
        createJob({
          jobType: 'conversation_idle_end_check',
          sessionId: 's-conv',
          tenantId: 't1',
        }),
      );

      expect(endConversation).not.toHaveBeenCalled();
      expect(
        mockLifecycleProducer.addConversationIdleEndCheckTask,
      ).not.toHaveBeenCalled();
    });
  });

  describe('manager 恢复、lease 与 cleanup 边界', () => {
    it('未知 jobType 不产生资源副作用', async () => {
      await expect(
        worker.process(createJob({ jobType: 'unknown', sessionId: 's1' })),
      ).resolves.toBeUndefined();
      expect(mockRuntimeDriver.createRuntime).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
    });

    it('start 缺少 config 应在 manager 调用前拒绝', async () => {
      await expect(
        worker.process(
          createJob({
            jobType: 'start',
            sessionId: 's1',
            tenantId: 't1',
            runtimeHandle: 'r1',
          }),
        ),
      ).rejects.toBeInstanceOf(SandboxCreationException);
      expect(mockRuntimeDriver.startRuntime).not.toHaveBeenCalled();
    });

    it('start 激活竞争失败时停止 runtime、释放 lease 且不恢复 workspace', async () => {
      mockReturning.mockResolvedValueOnce([]);
      mockRuntimeDriver.stopRuntime.mockRejectedValueOnce('already stopped');
      const workspaceService = {
        restoreToSandbox: vi.fn().mockResolvedValue(undefined),
      };
      mockModuleRef.get.mockReturnValue(workspaceService);

      await expect(
        worker.process(
          createJob({
            jobType: 'start',
            sessionId: 's1',
            tenantId: 't1',
            runtimeHandle: 'r1',
            config: {
              ...DEFAULT_CONFIG,
              lifecycleMode: 'persistent',
              restoreWorkspaceId: ' workspace-1 ',
            },
          }),
        ),
      ).resolves.toBeUndefined();

      expect(mockWorkspaceLeaseService.acquire).toHaveBeenCalled();
      expect(mockWorkspaceLeaseService.release).toHaveBeenCalled();
      expect(workspaceService.restoreToSandbox).not.toHaveBeenCalled();
      expect(mockLifecycleProducer.addTimeoutCheckTask).not.toHaveBeenCalled();
    });

    it('create 激活竞争失败即使 stop/delete cleanup 失败也释放 lease', async () => {
      mockReturning.mockResolvedValueOnce([]);
      mockRuntimeDriver.stopRuntime.mockRejectedValueOnce('stop failed');
      mockRuntimeDriver.deleteRuntime.mockRejectedValueOnce('delete failed');

      await expect(
        worker.process(
          createJob({
            jobType: 'create',
            sessionId: 's1',
            tenantId: 't1',
            config: {
              ...DEFAULT_CONFIG,
              restoreWorkspaceId: 'workspace-1',
            },
          }),
        ),
      ).resolves.toBeUndefined();

      expect(mockWorkspaceLeaseService.release).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'Sandbox runtime discarded because session left creating state',
        }),
      );
    });

    it('stop 无 handle 时仍提交 stopped 状态，但不碰 manager 或 lease renewal', async () => {
      await worker.process(
        createJob({
          jobType: 'stop',
          sessionId: 's1',
          tenantId: 't1',
          config: DEFAULT_CONFIG,
        }),
      );

      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
      expect(
        mockLifecycleProducer.removeWorkspaceLeaseRenewal,
      ).not.toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'stopped' }),
      );
    });

    it('lease renewal 在会话缺失、workspace 缺失或终态时移除重复任务', async () => {
      mockSandboxService.getSessionById
        .mockRejectedValueOnce(new Error('gone'))
        .mockResolvedValueOnce({
          id: 's1',
          status: 'ready',
          config: DEFAULT_CONFIG,
        })
        .mockResolvedValueOnce({
          id: 's1',
          status: 'failed',
          config: { ...DEFAULT_CONFIG, restoreWorkspaceId: 'workspace-1' },
        });

      for (let index = 0; index < 3; index += 1) {
        await worker.process(
          createJob({
            jobType: 'workspace_lease_renew',
            sessionId: 's1',
            tenantId: 't1',
          }),
        );
      }

      expect(
        mockLifecycleProducer.removeWorkspaceLeaseRenewal,
      ).toHaveBeenCalledTimes(3);
      expect(mockWorkspaceLeaseService.renewOwned).not.toHaveBeenCalled();
    });

    it('timeout 无 runtime handle 的 resource persistent 只更新状态且不抛错', async () => {
      mockSandboxService.getSessionById.mockResolvedValueOnce({
        id: 's-resource',
        executionId: null,
        agentConversationId: null,
        sandboxNodeId: null,
        status: 'ready',
        runtimeHandle: null,
        config: { ...DEFAULT_CONFIG, lifecycleMode: 'persistent' },
      });

      await expect(
        worker.process(
          createJob({
            jobType: 'timeout_check',
            sessionId: 's-resource',
            tenantId: 't1',
          }),
        ),
      ).resolves.toBeUndefined();

      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
      expect(mockRuntimeDriver.deleteRuntime).not.toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'stopped' }),
      );
    });

    it('路径与 binding 规范化保证归档始终租户隔离且稳定', () => {
      const internals = worker as unknown as {
        resolvePersistenceStorageKey(
          tenantId: string,
          bindingId: string,
          path: string,
        ): string;
        resolveBinding(data: Record<string, unknown>): Record<string, string>;
        getBindingId(binding: Record<string, string>): string;
      };

      expect(
        internals.resolvePersistenceStorageKey(
          't1',
          'e1/node-1',
          String.raw` \foo\..\bar\. `,
        ),
      ).toBe('tenants/t1/foo/bar/workspace.tar');
      expect(
        internals.resolvePersistenceStorageKey(
          't1',
          'e1',
          'tenants/t1/archive.tar',
        ),
      ).toBe('tenants/t1/archive.tar');
      expect(
        internals.resolvePersistenceStorageKey('t1', 'e1/node-1', ' /../ '),
      ).toBe('tenants/t1/sandboxes/e1/node-1/workspace.tar');
      expect(
        internals.resolveBinding({
          executionId: 'e1',
          agentConversationId: 'c1',
          sandboxNodeId: 'n1',
        }),
      ).toEqual({
        executionId: 'e1',
        agentConversationId: 'c1',
        sandboxNodeId: 'n1',
      });
      expect(internals.resolveBinding({})).toEqual({});
      expect(internals.getBindingId({ executionId: 'e1' })).toBe('e1');
      expect(
        internals.getBindingId({ executionId: 'e1', sandboxNodeId: 'n1' }),
      ).toBe('e1/n1');
      expect(internals.getBindingId({ agentConversationId: 'c1' })).toBe('c1');
      expect(internals.getBindingId({})).toBe('standalone');
    });

    it('workspace id 与 lease TTL 只接受有效配置并采用安全下限', () => {
      const internals = worker as unknown as {
        readRestoreWorkspaceId(config: unknown): string | undefined;
        resolveWorkspaceLeaseTtlMs(config: unknown): number;
      };

      expect(internals.readRestoreWorkspaceId(null)).toBeUndefined();
      expect(internals.readRestoreWorkspaceId([])).toBeUndefined();
      expect(
        internals.readRestoreWorkspaceId({ restoreWorkspaceId: ' ws-1 ' }),
      ).toBe('ws-1');
      expect(
        internals.readRestoreWorkspaceId({ restoreWorkspaceId: ' ' }),
      ).toBeUndefined();
      expect(internals.resolveWorkspaceLeaseTtlMs(null)).toBe(5 * 60_000);
      expect(internals.resolveWorkspaceLeaseTtlMs([])).toBe(5 * 60_000);
      expect(
        internals.resolveWorkspaceLeaseTtlMs({ timeout: Number.NaN }),
      ).toBe(61 * 60_000);
      expect(internals.resolveWorkspaceLeaseTtlMs({ timeout: 0.01 })).toBe(
        5 * 60_000,
      );
      expect(internals.resolveWorkspaceLeaseTtlMs({ timeout: 2 })).toBe(
        121 * 60_000,
      );
    });

    it('conversation 绑定去重，活动 run、running metadata 与未处理消息均阻止 expiry', () => {
      const internals = worker as unknown as {
        getBoundConversationIds(session: {
          agentConversationId: string | null;
          executionId: string | null;
          sandboxNodeId: string | null;
          config: SandboxConfig;
        }): string[];
        isConversationIdleForAutoEnd(
          conversation: { id: string; metadata: Record<string, unknown> },
          latestMessageId: string | undefined,
          executionService: unknown,
        ): boolean;
        readConversationExecutionMetadata(
          metadata: Record<string, unknown>,
        ): Record<string, unknown>;
      };
      expect(
        internals.getBoundConversationIds({
          agentConversationId: 'c1',
          executionId: null,
          sandboxNodeId: null,
          config: {
            ...DEFAULT_CONFIG,
            activeBindings: [
              { agentConversationId: 'c1' },
              { agentConversationId: 'c2' },
              { executionId: 'e1' },
            ],
          },
        }),
      ).toEqual(['c1', 'c2']);
      expect(
        internals.getBoundConversationIds({
          agentConversationId: null,
          executionId: null,
          sandboxNodeId: null,
          config: DEFAULT_CONFIG,
        }),
      ).toEqual([]);
      const activeRun = {
        getActiveRun: vi.fn().mockReturnValue({
          abort: { signal: { aborted: false } },
        }),
      };
      expect(
        internals.isConversationIdleForAutoEnd(
          { id: 'c1', metadata: {} },
          undefined,
          activeRun,
        ),
      ).toBe(false);
      expect(
        internals.isConversationIdleForAutoEnd(
          {
            id: 'c1',
            metadata: { execution: { runningState: 'running' } },
          },
          undefined,
          null,
        ),
      ).toBe(false);
      expect(
        internals.isConversationIdleForAutoEnd(
          {
            id: 'c1',
            metadata: {
              execution: {
                runningState: 'idle',
                lastProcessedMessageId: 'old',
              },
            },
          },
          'new',
          null,
        ),
      ).toBe(false);
      expect(
        internals.isConversationIdleForAutoEnd(
          {
            id: 'c1',
            metadata: {
              execution: {
                runningState: 'idle',
                lastProcessedMessageId: 'new',
              },
            },
          },
          'new',
          null,
        ),
      ).toBe(true);
      expect(
        internals.readConversationExecutionMetadata({
          execution: [],
        }),
      ).toEqual({});
      expect(
        internals.readConversationExecutionMetadata({
          execution: {
            lastProcessedMessageId: 1,
            runningState: null,
          },
        }),
      ).toEqual({});
    });

    it('workspace restore/snapshot 缺少依赖或 fencing token 时 fail closed', async () => {
      const internals = worker as unknown as {
        restoreWorkspaceIfNeeded(
          params: Record<string, unknown>,
        ): Promise<void>;
        syncRestoredWorkspaceSnapshot(
          params: Record<string, unknown>,
        ): Promise<void>;
      };

      await expect(
        internals.restoreWorkspaceIfNeeded({
          sessionId: 's1',
          tenantId: 't1',
          runtimeHandle: 'r1',
        }),
      ).resolves.toBeUndefined();
      await expect(
        internals.syncRestoredWorkspaceSnapshot({
          sessionId: 's1',
          tenantId: 't1',
          runtimeHandle: 'r1',
          phaseLabel: 'stop',
          leaseToken: null,
        }),
      ).resolves.toBeUndefined();
      mockModuleRef.get.mockReturnValue(undefined);
      await expect(
        internals.restoreWorkspaceIfNeeded({
          sessionId: 's1',
          tenantId: 't1',
          runtimeHandle: 'r1',
          restoreWorkspaceId: 'ws-1',
        }),
      ).rejects.toBeInstanceOf(SandboxCreationException);
      const fencingError = await internals
        .syncRestoredWorkspaceSnapshot({
          sessionId: 's1',
          tenantId: 't1',
          runtimeHandle: 'r1',
          restoreWorkspaceId: 'ws-1',
          phaseLabel: 'stop',
          leaseToken: null,
        })
        .catch((error: unknown) => error);
      expect(fencingError).toBeInstanceOf(SandboxCreationException);
      expect(fencingError).toMatchObject({
        message: '沙箱容器创建失败',
        detail: expect.stringContaining('no active fencing token'),
      });
      expect(mockSet).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ready' }),
      );
      const missingServiceError = await internals
        .syncRestoredWorkspaceSnapshot({
          sessionId: 's1',
          tenantId: 't1',
          runtimeHandle: 'r1',
          restoreWorkspaceId: 'ws-1',
          phaseLabel: 'destroy',
          leaseToken: {
            workspaceId: 'ws-1',
            sandboxSessionId: 's1',
            fencingToken: 1,
          },
        })
        .catch((error: unknown) => error);
      expect(missingServiceError).toBeInstanceOf(SandboxCreationException);
      expect(missingServiceError).toMatchObject({
        message: '沙箱容器创建失败',
        detail: expect.stringContaining('WorkspaceService unavailable'),
      });
    });

    it('workspace snapshot 同步失败向上抛出原始非 Error，禁止继续破坏 runtime', async () => {
      const workspaceService = {
        syncFromSandboxContainer: vi.fn().mockRejectedValue('sync denied'),
      };
      mockModuleRef.get.mockReturnValue(workspaceService);
      const internals = worker as unknown as {
        syncRestoredWorkspaceSnapshot(
          params: Record<string, unknown>,
        ): Promise<void>;
      };

      await expect(
        internals.syncRestoredWorkspaceSnapshot({
          sessionId: 's1',
          tenantId: 't1',
          runtimeHandle: 'r1',
          restoreWorkspaceId: 'ws-1',
          phaseLabel: 'timeout',
          leaseToken: {
            workspaceId: 'ws-1',
            sandboxSessionId: 's1',
            fencingToken: 1,
          },
        }),
      ).rejects.toBe('sync denied');
      expect(mockRuntimeDriver.stopRuntime).not.toHaveBeenCalled();
    });

    it('可选模块查找异常时统一降级为 null', () => {
      mockModuleRef.get.mockImplementation(() => {
        throw new Error('module unavailable');
      });
      const internals = worker as unknown as {
        getAgentExecutionService(): unknown;
        getAgentConversationService(): unknown;
        getWorkspaceService(): unknown;
      };

      expect(internals.getAgentExecutionService()).toBeNull();
      expect(internals.getAgentConversationService()).toBeNull();
      expect(internals.getWorkspaceService()).toBeNull();
    });

    it('schedule helpers 对缺失 config/binding 保持无任务，对有效 conversation 调度一次', async () => {
      const internals = worker as unknown as {
        scheduleConversationIdleEndCheck(
          sessionId: string,
          tenantId: string,
          config: SandboxConfig | undefined,
          conversationIds?: string[],
        ): Promise<void>;
      };

      await internals.scheduleConversationIdleEndCheck('s1', 't1', undefined, [
        'c1',
      ]);
      await internals.scheduleConversationIdleEndCheck(
        's1',
        't1',
        DEFAULT_CONFIG,
      );
      await internals.scheduleConversationIdleEndCheck(
        's1',
        't1',
        DEFAULT_CONFIG,
        ['c1'],
      );

      expect(
        mockLifecycleProducer.addConversationIdleEndCheckTask,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
