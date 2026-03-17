import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import { EARNINGS_SETTLEMENT_QUEUE } from './plugin.constants';
import type { EarningsSettlementJobData } from './earnings-settlement.worker';

@Injectable()
export class PluginEarningsSettlementProducer {
  constructor(
    @InjectQueue(EARNINGS_SETTLEMENT_QUEUE)
    private readonly queue: Queue<EarningsSettlementJobData>,
  ) {}

  addSettlementJob(data: EarningsSettlementJobData) {
    return this.queue.add('settle-plugin-earnings', data, {
      jobId: `settle-plugin-earnings:${data.tenantId}:${data.orgId}:${data.periodStart}:${data.periodEnd}`,
    });
  }
}
