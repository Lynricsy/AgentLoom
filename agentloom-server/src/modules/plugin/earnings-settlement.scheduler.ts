import { getQueueToken } from '@nestjs/bullmq';
import { Dependencies, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  EARNINGS_SETTLEMENT_DISPATCH_JOB_ID,
  EARNINGS_SETTLEMENT_DISPATCH_JOB_NAME,
  EARNINGS_SETTLEMENT_DISPATCH_SCHEDULE,
  EARNINGS_SETTLEMENT_QUEUE,
} from './plugin.constants';

/**
 * 注册插件收益结算的周期派发任务。
 *
 * 结算周期为上一个 UTC 自然月；派发任务本身不做结算，
 * 只负责扫描 usage ledger 并为每个来源组织入队具体的结算 job。
 */
@Injectable()
@Dependencies(getQueueToken(EARNINGS_SETTLEMENT_QUEUE))
export class EarningsSettlementScheduler implements OnModuleInit {
  constructor(private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      EARNINGS_SETTLEMENT_DISPATCH_JOB_ID,
      {
        pattern: EARNINGS_SETTLEMENT_DISPATCH_SCHEDULE,
        tz: 'UTC',
      },
      {
        name: EARNINGS_SETTLEMENT_DISPATCH_JOB_NAME,
      },
    );
  }
}
