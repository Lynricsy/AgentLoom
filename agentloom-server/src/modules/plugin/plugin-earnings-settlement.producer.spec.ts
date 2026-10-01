import { describe, expect, it, vi, type Mock } from 'vitest';

import { PluginEarningsSettlementProducer } from './plugin-earnings-settlement.producer';

const SEPTEMBER = {
  tenantId: '019391d4-a000-7000-0000-000000000001',
  orgId: '019391d4-a000-7000-0000-000000000002',
  periodStart: '2026-09-01T00:00:00.000Z',
  periodEnd: '2026-09-30T23:59:59.999Z',
};

function createProducer() {
  const add = vi.fn().mockResolvedValue({ id: 'job' });
  const producer = new PluginEarningsSettlementProducer({ add } as never);
  return { producer, add };
}

function jobIdOf(add: Mock, call = 0): string {
  const options = add.mock.calls[call]?.[2] as { jobId: string };
  return options.jobId;
}

describe('PluginEarningsSettlementProducer', () => {
  // BullMQ 6 的 Job.validateOptions 对含 `:` 且段数 ≠ 3 的自定义 jobId 直接抛
  // `Custom Id cannot contain :`，queue.add 失败会让整月结算派发中断。
  it('jobId 不含冒号，满足 BullMQ 自定义 ID 约束', async () => {
    const { producer, add } = createProducer();

    await producer.addSettlementJob(SEPTEMBER);

    expect(jobIdOf(add)).not.toContain(':');
  });

  it('同一租户/组织/周期生成相同 jobId，保证重复派发被 BullMQ 去重', async () => {
    const { producer, add } = createProducer();

    await producer.addSettlementJob(SEPTEMBER);
    await producer.addSettlementJob({ ...SEPTEMBER });

    expect(jobIdOf(add, 0)).toBe(jobIdOf(add, 1));
  });

  it('不同组织或不同周期生成不同 jobId', async () => {
    const { producer, add } = createProducer();

    await producer.addSettlementJob(SEPTEMBER);
    await producer.addSettlementJob({
      ...SEPTEMBER,
      orgId: '019391d4-a000-7000-0000-000000000003',
    });
    await producer.addSettlementJob({
      ...SEPTEMBER,
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-10-31T23:59:59.999Z',
    });

    const ids = new Set([jobIdOf(add, 0), jobIdOf(add, 1), jobIdOf(add, 2)]);
    expect(ids.size).toBe(3);
  });
});
