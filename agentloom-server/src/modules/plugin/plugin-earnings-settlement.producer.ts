import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import { EARNINGS_SETTLEMENT_QUEUE } from './plugin.constants';
import type { EarningsSettlementJobData } from './earnings-settlement.worker';

/**
 * 同一租户/组织/周期的确定性 jobId，重复派发由 BullMQ 去重。
 *
 * BullMQ 6 拒绝含 `:` 的自定义 jobId（`Custom Id cannot contain :`），故 ISO
 * 时间戳去掉 `-:.`，段间用 `_`（UUID 自带 `-`）。
 */
function buildSettlementJobId(data: EarningsSettlementJobData): string {
  return [
    'settle-plugin-earnings',
    data.tenantId,
    data.orgId,
    data.periodStart.replace(/[-:.]/g, ''),
    data.periodEnd.replace(/[-:.]/g, ''),
  ].join('_');
}

@Injectable()
export class PluginEarningsSettlementProducer {
  constructor(
    @InjectQueue(EARNINGS_SETTLEMENT_QUEUE)
    private readonly queue: Queue<EarningsSettlementJobData>,
  ) {}

  addSettlementJob(data: EarningsSettlementJobData) {
    return this.queue.add('settle-plugin-earnings', data, {
      jobId: buildSettlementJobId(data),
    });
  }
}
