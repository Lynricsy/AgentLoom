import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { SandboxConfig } from '../../../database/schema';

const mockDockerService = {
  createContainer: vi.fn().mockResolvedValue({ containerId: 'c-123' }),
  stopContainer: vi.fn().mockResolvedValue(undefined),
  removeContainer: vi.fn().mockResolvedValue(undefined),
  attachLogs: vi.fn().mockResolvedValue(undefined),
};

const mockSandboxService = {
  getSandboxSession: vi.fn(),
};

const mockLifecycleProducer = {
  addTimeoutCheckTask: vi.fn().mockResolvedValue({ id: 'timeout-job' }),
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
  runInTenantTransaction: vi.fn((_db: any, _tenantId: string, op: () => Promise<any>) => op()),
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
      mockDockerService as any,
      mockSandboxService as any,
      mockLifecycleProducer as any,
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
      );
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          containerId: 'c-123',
          status: 'ready',
        }),
      );
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

      expect(mockDockerService.stopContainer).toHaveBeenCalledWith('c-123');
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith('c-123');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
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
  });
});
