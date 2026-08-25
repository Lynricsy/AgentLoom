import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EarningsSettlementScheduler } from './earnings-settlement.scheduler';
import {
  EARNINGS_SETTLEMENT_DISPATCH_JOB_ID,
  EARNINGS_SETTLEMENT_DISPATCH_JOB_NAME,
  EARNINGS_SETTLEMENT_DISPATCH_SCHEDULE,
} from './plugin.constants';

describe('EarningsSettlementScheduler', () => {
  const queue = {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  };

  let scheduler: EarningsSettlementScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new EarningsSettlementScheduler(queue as never);
  });

  it('应在模块初始化时注册月度结算派发任务', async () => {
    await scheduler.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      EARNINGS_SETTLEMENT_DISPATCH_JOB_ID,
      {
        pattern: EARNINGS_SETTLEMENT_DISPATCH_SCHEDULE,
        tz: 'UTC',
      },
      {
        name: EARNINGS_SETTLEMENT_DISPATCH_JOB_NAME,
      },
    );
  });

  it('派发任务应固定为每月 1 日 03:00 UTC', () => {
    expect(EARNINGS_SETTLEMENT_DISPATCH_SCHEDULE).toBe('0 3 1 * *');
  });
});
