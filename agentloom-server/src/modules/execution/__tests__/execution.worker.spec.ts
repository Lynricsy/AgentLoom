import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { ExecutionWorker } from '../execution.worker';
import { ExecutionService, type ExecutionJobData } from '../execution.service';

const EXECUTION_ID = '019391d4-d000-7000-0000-000000000004';

const mockExecutionService: Record<string, Mock> = {
  initializeSteps: vi.fn(),
  markFailed: vi.fn(),
};

function createMockJob(
  overrides: Partial<Job<ExecutionJobData>> = {},
): Job<ExecutionJobData> {
  return {
    data: {
      executionId: EXECUTION_ID,
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
      ],
    }).compile();

    worker = module.get(ExecutionWorker);
  });

  describe('process', () => {
    it('应调用 initializeSteps 处理执行任务', async () => {
      mockExecutionService.initializeSteps.mockResolvedValue(undefined);

      const job = createMockJob();
      await worker.process(job);

      expect(mockExecutionService.initializeSteps).toHaveBeenCalledWith(
        EXECUTION_ID,
      );
    });

    it('应在 initializeSteps 失败时抛出错误', async () => {
      const error = new Error('初始化步骤失败');
      mockExecutionService.initializeSteps.mockRejectedValue(error);

      const job = createMockJob();

      await expect(worker.process(job)).rejects.toThrow('初始化步骤失败');
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
