import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OPTIMIZATION_ANALYSIS_JOB_NAME,
  OPTIMIZATION_ANALYSIS_QUEUE,
} from '../optimization-analysis.constants';
import {
  OptimizationAnalysisWorker,
  type OptimizationAnalysisJobData,
} from '../optimization-analysis.worker';

const { createMockAnalysisService } = vi.hoisted(() => ({
  createMockAnalysisService: () => ({
    runAnalysis: vi.fn(),
  }),
}));

type MockAnalysisService = ReturnType<typeof createMockAnalysisService>;

function createJob(
  overrides: Partial<OptimizationAnalysisJobData> = {},
): Job<OptimizationAnalysisJobData> {
  return {
    id: 'job-1',
    name: OPTIMIZATION_ANALYSIS_JOB_NAME,
    queueName: OPTIMIZATION_ANALYSIS_QUEUE,
    attemptsMade: 0,
    data: {
      tenantId: '11111111-1111-4111-8111-111111111111',
      ...overrides,
    },
  } as unknown as Job<OptimizationAnalysisJobData>;
}

describe('OptimizationAnalysisWorker', () => {
  let worker: OptimizationAnalysisWorker;
  let analysisService: MockAnalysisService;

  beforeEach(() => {
    vi.clearAllMocks();
    analysisService = createMockAnalysisService();
    worker = new OptimizationAnalysisWorker(analysisService as never);
  });

  it('process 应调用分析服务并透传 tenantId', async () => {
    await worker.process(createJob());

    expect(analysisService.runAnalysis).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('onCompleted 应记录成功日志', () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});

    worker.onCompleted(createJob({ tenantId: 'tenant-1' }));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Optimization analysis completed'),
    );
  });

  it('onFailed 应记录失败日志', () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    worker.onFailed(createJob({ tenantId: 'tenant-1' }), new Error('boom'));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Optimization analysis failed'),
    );
  });

  it('onCompleted 在 job 缺失时也应记录兜底日志', () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});

    worker.onCompleted(undefined);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"jobId":null'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"tenantId":null'),
    );
  });

  it('onFailed 在 job 缺失时也应记录兜底字段', () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    worker.onFailed(undefined, new Error('boom'));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"attempt":null'),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"tenantId":null'),
    );
  });
});
