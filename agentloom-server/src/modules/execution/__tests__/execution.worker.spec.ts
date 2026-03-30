import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DRIZZLE } from '../../../database/database.module';
import { ExecutionWorker } from '../execution.worker';
import { ExecutionService, type ExecutionJobData } from '../execution.service';
import { NodeSchedulerService } from '../node-scheduler.service';

const EXECUTION_ID = '019391d4-d000-7000-0000-000000000004';
const TENANT_ID = '019391d4-d000-7000-0000-000000000099';

const mockExecutionService: Record<string, Mock> = {
  initializeSteps: vi.fn(),
  markFailed: vi.fn(),
};

const mockNodeScheduler: Record<string, Mock> = {
  startExecution: vi.fn(),
  resumeScheduling: vi.fn(),
};

const mockDb = {};

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
        { provide: DRIZZLE, useValue: mockDb },
        { provide: ExecutionService, useValue: mockExecutionService },
        { provide: NodeSchedulerService, useValue: mockNodeScheduler },
      ],
    }).compile();

    worker = module.get(ExecutionWorker);
  });

  describe('process', () => {
    it('应先初始化步骤，再启动 DAG 调度', async () => {
      mockExecutionService.initializeSteps.mockResolvedValue(undefined);
      mockNodeScheduler.startExecution.mockResolvedValue(undefined);

      const job = createMockJob();
      await worker.process(job);

      expect(mockExecutionService.initializeSteps).toHaveBeenCalledWith(
        EXECUTION_ID,
      );
      expect(mockNodeScheduler.startExecution).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
      expect(
        mockExecutionService.initializeSteps.mock.invocationCallOrder[0],
      ).toBeLessThan(
        mockNodeScheduler.startExecution.mock.invocationCallOrder[0],
      );
    });

    it('应在 startExecution 失败时抛出错误', async () => {
      mockExecutionService.initializeSteps.mockResolvedValue(undefined);
      const error = new Error('DAG 调度失败');
      mockNodeScheduler.startExecution.mockRejectedValue(error);

      const job = createMockJob();

      await expect(worker.process(job)).rejects.toThrow('DAG 调度失败');
    });

    it('应处理 resume-execution 任务并调用 resumeScheduling', async () => {
      mockNodeScheduler.resumeScheduling.mockResolvedValue(undefined);

      const job = createMockJob({ name: 'resume-execution' });

      await worker.process(job);

      expect(mockNodeScheduler.resumeScheduling).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
      expect(mockExecutionService.initializeSteps).not.toHaveBeenCalled();
      expect(mockNodeScheduler.startExecution).not.toHaveBeenCalled();
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
