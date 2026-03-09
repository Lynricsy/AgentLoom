import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { ExecutionWorker } from '../execution.worker';
import { ExecutionService, type ExecutionJobData } from '../execution.service';
import { NodeSchedulerService } from '../node-scheduler.service';

const EXECUTION_ID = '019391d4-d000-7000-0000-000000000004';
const TENANT_ID = '019391d4-d000-7000-0000-000000000099';

const mockExecutionService: Record<string, Mock> = {
  markFailed: vi.fn(),
};

const mockNodeScheduler: Record<string, Mock> = {
  startExecution: vi.fn(),
};

function createMockJob(
  overrides: Partial<Job<ExecutionJobData>> = {},
): Job<ExecutionJobData> {
  return {
    data: {
      executionId: EXECUTION_ID,
      tenantId: TENANT_ID,
    },
    id: 'job-1',
    attemptsMade: 0,
    opts: {},
    ...overrides,
  } as Job<ExecutionJobData>;
}

describe('ExecutionWorker', () => {
  let worker: ExecutionWorker;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ExecutionWorker,
        { provide: ExecutionService, useValue: mockExecutionService },
        { provide: NodeSchedulerService, useValue: mockNodeScheduler },
      ],
    }).compile();

    worker = module.get(ExecutionWorker);
  });

  describe('process', () => {
    it('应调用 nodeScheduler.startExecution 启动 DAG 调度', async () => {
      mockNodeScheduler.startExecution.mockResolvedValue(undefined);

      const job = createMockJob();
      await worker.process(job);

      expect(mockNodeScheduler.startExecution).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
    });

    it('应在 startExecution 失败时抛出错误', async () => {
      const error = new Error('DAG 调度失败');
      mockNodeScheduler.startExecution.mockRejectedValue(error);

      const job = createMockJob();

      await expect(worker.process(job)).rejects.toThrow('DAG 调度失败');
    });
  });

  describe('onFailed', () => {
    it('应调用 markFailed 标记执行失败', async () => {
      mockExecutionService.markFailed.mockResolvedValue(undefined);

      const job = createMockJob();
      const error = new Error('队列处理失败');
      await worker.onFailed(job, error);

      expect(mockExecutionService.markFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        error,
      );
    });
  });
});
