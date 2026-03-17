import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OPTIMIZATION_ANALYSIS_JOB_ID,
  OPTIMIZATION_ANALYSIS_JOB_NAME,
} from '../optimization-analysis.constants';
import { OptimizationAnalysisScheduler } from '../optimization-analysis.scheduler';

function createMockQueue() {
  return {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  };
}

describe('OptimizationAnalysisScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('onModuleInit 应注册每周重复任务', async () => {
    const queue = createMockQueue();
    const scheduler = new OptimizationAnalysisScheduler(queue as never);

    await scheduler.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      OPTIMIZATION_ANALYSIS_JOB_ID,
      {
        pattern: '0 2 * * 1',
        tz: 'UTC',
      },
      {
        name: OPTIMIZATION_ANALYSIS_JOB_NAME,
        data: {},
      },
    );
  });
});
