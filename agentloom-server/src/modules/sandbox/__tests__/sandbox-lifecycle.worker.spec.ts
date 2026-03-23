import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

import type { SandboxConfig } from '../../../database/schema';

const mockDockerService = {
  createContainer: vi.fn().mockResolvedValue({ containerId: 'c-123' }),
  stopContainer: vi.fn().mockResolvedValue(undefined),
  removeContainer: vi.fn().mockResolvedValue(undefined),
  attachLogs: vi.fn().mockResolvedValue(undefined),
  getArchive: vi
    .fn()
    .mockResolvedValue(Readable.from(Buffer.from('fake-archive'))),
};

const mockSandboxService = {
  getSandboxSession: vi.fn(),
  findByConversationId: vi.fn(),
};

const mockLifecycleProducer = {
  addTimeoutCheckTask: vi.fn().mockResolvedValue({ id: 'timeout-job' }),
};

const mockStorageService = {
  upload: vi.fn().mockResolvedValue(undefined),
};

const mockUpdate = vi.fn().mockReturnThis();
const mockSet = vi.fn().mockReturnThis();
const mockWhere = vi.fn().mockResolvedValue(undefined);
const mockInsert = vi.fn().mockReturnThis();
const mockValues = vi.fn().mockResolvedValue(undefined);

const mockTenantDb = {
  update: mockUpdate,
  insert: mockInsert,
};
mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: mockWhere });
mockInsert.mockReturnValue({ values: mockValues });

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: vi.fn(
    (_db: any, _tenantId: string, op: () => Promise<any>) => op(),
  ),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(() => mockTenantDb),
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
    mockInsert.mockReturnValue({ values: mockValues });

    worker = new SandboxLifecycleWorker(
      {} as any,
      {} as any,
      mockDockerService as any,
      mockSandboxService as any,
      mockLifecycleProducer as any,
      mockStorageService as any,
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

      expect(mockDockerService.createContainer).toHaveBeenCalledWith(
        's1',
        DEFAULT_CONFIG,
        { piConfigInput: undefined, conversationId: undefined },
      );
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          containerId: 'c-123',
          status: 'ready',
          workspacePath: '/workspace/',
        }),
      );
      expect(mockInsert).toHaveBeenCalled();
      expect(mockDockerService.attachLogs).toHaveBeenCalledWith(
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

    it('容器创建失败时应回写 session failed 并记录系统日志', async () => {
      mockDockerService.createContainer.mockRejectedValueOnce(
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
        mockDockerService as any,
        mockSandboxService as any,
        mockLifecycleProducer as any,
        mockStorageService as any,
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

    it('工作区恢复失败时不阻塞沙箱创建', async () => {
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
        mockDockerService as any,
        mockSandboxService as any,
        mockLifecycleProducer as any,
        mockStorageService as any,
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

      expect(mockWorkspaceService.restoreToSandbox).toHaveBeenCalled();
      expect(mockDockerService.attachLogs).toHaveBeenCalled();
      expect(mockLifecycleProducer.addTimeoutCheckTask).toHaveBeenCalled();
    });
  });

  describe('destroy job', () => {
    it('应停止并删除容器、更新状态为 stopped', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          containerId: 'c-123',
        }),
      );

      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('c-123');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'stopped' }),
      );
      expect(mockInsert).toHaveBeenCalled();
    });

    it('无 containerId 时应仅更新状态', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
        }),
      );

      expect(mockDockerService.stopContainer).not.toHaveBeenCalled();
      expect(mockDockerService.removeContainer).not.toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'stopped' }),
      );
    });

    it('有 persistencePath 时应在删除前同步 workspace 到 MinIO', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          containerId: 'c-123',
          persistencePath: '/outputs/result',
        }),
      );

      expect(mockDockerService.getArchive).toHaveBeenCalledWith(
        'c-123',
        '/workspace/',
      );
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/t1/outputs/result/workspace.tar',
        expect.any(Readable),
        undefined,
        'application/x-tar',
      );
      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('c-123');
    });

    it('无 persistencePath 时不应同步 workspace', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          containerId: 'c-123',
        }),
      );

      expect(mockDockerService.getArchive).not.toHaveBeenCalled();
      expect(mockStorageService.upload).not.toHaveBeenCalled();
      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
    });

    it('workspace 同步失败时不应阻止销毁流程', async () => {
      mockDockerService.getArchive.mockRejectedValueOnce(
        new Error('archive failed'),
      );

      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          containerId: 'c-123',
          persistencePath: '/outputs/result',
        }),
      );

      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('c-123');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'stopped' }),
      );
    });

    it('已包含租户前缀的 persistencePath 不应重复拼接', async () => {
      await worker.process(
        createJob({
          jobType: 'destroy',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
          containerId: 'c-123',
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
          containerId: 'c-123',
        }),
      );

      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('c-123');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'stopped' }),
      );
    });
  });

  describe('timeout_check job', () => {
    it('会话仍活跃时应强制停止并标记为 failed', async () => {
      mockSandboxService.getSandboxSession.mockResolvedValueOnce({
        id: 's1',
        status: 'ready',
        containerId: 'c-123',
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

      expect(mockSandboxService.getSandboxSession).toHaveBeenCalledWith(
        'e1',
        't1',
      );
      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('c-123');
      const updatePayloads = mockSet.mock.calls.map(([payload]) => payload);
      expect(updatePayloads).toContainEqual(
        expect.objectContaining({
          status: 'failed',
          stoppedAt: expect.any(Date),
        }),
      );
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
      expect(mockInsert).toHaveBeenCalled();
    });

    it('会话已停止时应跳过处理', async () => {
      mockSandboxService.getSandboxSession.mockResolvedValueOnce({
        id: 's1',
        status: 'stopped',
        containerId: 'c-123',
      });

      await worker.process(
        createJob({
          jobType: 'timeout_check',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
        }),
      );

      expect(mockDockerService.stopContainer).not.toHaveBeenCalled();
    });

    it('会话不存在时应跳过处理', async () => {
      mockSandboxService.getSandboxSession.mockResolvedValueOnce(null);

      await worker.process(
        createJob({
          jobType: 'timeout_check',
          sessionId: 's1',
          executionId: 'e1',
          tenantId: 't1',
        }),
      );

      expect(mockDockerService.stopContainer).not.toHaveBeenCalled();
    });

    it('conversation timeout 应只停止 sandbox 且不级联失败 workflow', async () => {
      mockSandboxService.findByConversationId.mockResolvedValueOnce({
        id: 's-conv',
        status: 'ready',
        containerId: 'c-123',
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

      expect(mockSandboxService.findByConversationId).toHaveBeenCalledWith(
        'conv-1',
        't1',
      );
      expect(mockSandboxService.getSandboxSession).not.toHaveBeenCalled();
      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('c-123');
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
      mockSandboxService.getSandboxSession.mockResolvedValueOnce({
        id: 's1',
        status: 'ready',
        containerId: 'c-123',
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

      expect(mockDockerService.getArchive).toHaveBeenCalledWith(
        'c-123',
        '/workspace/',
      );
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/t1/outputs/result/workspace.tar',
        expect.any(Readable),
        undefined,
        'application/x-tar',
      );
      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('c-123');
    });

    it('timeout 归档失败时应警告但仍然销毁沙箱', async () => {
      mockSandboxService.getSandboxSession.mockResolvedValueOnce({
        id: 's1',
        status: 'ready',
        containerId: 'c-123',
        config: {
          cpu: 1,
          memory: 512,
          disk: 2,
          timeout: 2,
          persistencePath: '/outputs/result',
        },
      });

      mockDockerService.getArchive.mockRejectedValueOnce(
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

      expect(mockDockerService.getArchive).toHaveBeenCalledWith(
        'c-123',
        '/workspace/',
      );
      expect(mockStorageService.upload).not.toHaveBeenCalled();
      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('c-123');
    });

    it('timeout 时无 persistencePath 不应尝试归档', async () => {
      mockSandboxService.getSandboxSession.mockResolvedValueOnce({
        id: 's1',
        status: 'ready',
        containerId: 'c-123',
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

      expect(mockDockerService.getArchive).not.toHaveBeenCalled();
      expect(mockStorageService.upload).not.toHaveBeenCalled();
      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
    });

    it('conversation timeout 时有 persistencePath 应归档 workspace', async () => {
      mockSandboxService.findByConversationId.mockResolvedValueOnce({
        id: 's-conv',
        status: 'ready',
        containerId: 'c-123',
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

      expect(mockDockerService.getArchive).toHaveBeenCalledWith(
        'c-123',
        '/workspace/',
      );
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        'tenants/t1/conv-outputs/workspace.tar',
        expect.any(Readable),
        undefined,
        'application/x-tar',
      );
      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
    });
  });
});
