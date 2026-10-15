/**
 * LLM 成本换算：不重叠计数、逐次调用阶梯价、缓存读写价、未定价返回 null，以及定价缓存。
 */
import { describe, expect, it, vi } from 'vitest';

import type { ModelPricing } from '../../../database/schema/llm-model-configs.schema';
import { estimateCostUsdForCalls, LlmCostService } from '../llm-cost.service';

describe('estimateCostUsdForCalls', () => {
  const basePricing: ModelPricing = {
    inputPer1MTokens: 3,
    outputPer1MTokens: 15,
  };
  const tieredPricing: ModelPricing = {
    ...basePricing,
    tiers: [
      { aboveTokens: 200_000, inputPer1MTokens: 6, outputPer1MTokens: 22.5 },
      { aboveTokens: 100_000, inputPer1MTokens: 4, outputPer1MTokens: 20 },
    ],
  };

  it('未定价返回 null', () => {
    expect(
      estimateCostUsdForCalls(null, [
        { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      ]),
    ).toBeNull();
  });

  it('按基础价换算并保留 6 位小数', () => {
    // 1000 * 3 + 500 * 15 = 10500 → 0.0105
    expect(
      estimateCostUsdForCalls(basePricing, [
        { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      ]),
    ).toBe(0.0105);
  });

  it('inputTokens 是未缓存输入，缓存读不从中扣除', () => {
    // 1000 * 3 + 400 * 0.3 = 3120 → 0.00312
    expect(
      estimateCostUsdForCalls({ ...basePricing, cachedReadPer1MTokens: 0.3 }, [
        {
          inputTokens: 1000,
          outputTokens: 0,
          cacheReadTokens: 400,
          totalTokens: 1400,
        },
      ]),
    ).toBe(0.00312);
  });

  it('缓存写缺少专门单价时回退输入单价', () => {
    // 1000*3 + 400*0.3 + 200*3 + 100*15 = 3000 + 120 + 600 + 1500 = 5220
    expect(
      estimateCostUsdForCalls({ ...basePricing, cachedReadPer1MTokens: 0.3 }, [
        {
          inputTokens: 1000,
          outputTokens: 100,
          cacheReadTokens: 400,
          cacheWriteTokens: 200,
          totalTokens: 1700,
        },
      ]),
    ).toBe(0.00522);
  });

  it('阶梯价取 aboveTokens < 完整 prompt 的最高档，恰好等于阈值仍用低一档', () => {
    // 未达任何档：基础价 1000*3 = 3000
    expect(
      estimateCostUsdForCalls(tieredPricing, [
        { inputTokens: 1000, outputTokens: 0, totalTokens: 1000 },
      ]),
    ).toBe(0.003);
    // 恰好 200k 不超过 200k 档，命中 100k 档：200000*4 = 800000
    expect(
      estimateCostUsdForCalls(tieredPricing, [
        { inputTokens: 200_000, outputTokens: 0, totalTokens: 200_000 },
      ]),
    ).toBe(0.8);
    // 250k 命中 200k 档：250000*6 + 1000*22.5 = 1522500
    expect(
      estimateCostUsdForCalls(tieredPricing, [
        { inputTokens: 250_000, outputTokens: 1000, totalTokens: 251_000 },
      ]),
    ).toBe(1.5225);
  });

  it('阶梯按未缓存 + 缓存读 + 缓存写的完整 prompt 选择', () => {
    // 50k + 160k = 210k > 200k → 6/M 档；缓存读无专门单价按档内输入价：210000*6 = 1260000
    expect(
      estimateCostUsdForCalls(tieredPricing, [
        {
          inputTokens: 50_000,
          outputTokens: 0,
          cacheReadTokens: 160_000,
          totalTokens: 210_000,
        },
      ]),
    ).toBe(1.26);
  });

  it('逐次调用定价：两次各 120k 输入都按基础价，不因累加越过 200k 档', () => {
    const pricing: ModelPricing = {
      ...basePricing,
      tiers: [
        { aboveTokens: 200_000, inputPer1MTokens: 6, outputPer1MTokens: 22.5 },
      ],
    };
    const call = {
      inputTokens: 120_000,
      outputTokens: 0,
      totalTokens: 120_000,
    };
    // 2 * 120000 * 3 = 720000 → 0.72（先累加再定价会得到 240000*6 → 1.44）
    expect(estimateCostUsdForCalls(pricing, [call, call])).toBe(0.72);
  });

  it('无调用时成本为 0', () => {
    expect(estimateCostUsdForCalls(basePricing, [])).toBe(0);
  });
});

describe('LlmCostService.estimateCallsCostUsd', () => {
  it('无模型配置或无调用时不查询定价', async () => {
    const service = new LlmCostService({} as never);
    const resolvePricing = vi.spyOn(service, 'resolvePricing');

    await expect(
      service.estimateCallsCostUsd('tenant-1', undefined, [
        { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      ]),
    ).resolves.toBeNull();
    await expect(
      service.estimateCallsCostUsd('tenant-1', 'model-1', []),
    ).resolves.toBeNull();
    expect(resolvePricing).not.toHaveBeenCalled();
  });

  it('定价查询失败时返回 null 而不抛出', async () => {
    const service = new LlmCostService({} as never);
    vi.spyOn(service, 'resolvePricing').mockRejectedValue(new Error('db down'));

    await expect(
      service.estimateCallsCostUsd('tenant-1', 'model-1', [
        { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      ]),
    ).resolves.toBeNull();
  });
});

describe('LlmCostService.resolvePricing', () => {
  it('查询模型配置定价并在 60 秒内复用缓存', async () => {
    const pricing: ModelPricing = { inputPer1MTokens: 1, outputPer1MTokens: 2 };
    const limit = vi.fn().mockResolvedValue([{ pricing }]);
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ limit }) }),
      })),
    };
    const db = {
      transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
    };
    const service = new LlmCostService(db as never);

    await expect(service.resolvePricing('tenant-1', 'model-1')).resolves.toBe(
      pricing,
    );
    await expect(service.resolvePricing('tenant-1', 'model-1')).resolves.toBe(
      pricing,
    );
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it('模型配置不存在或未定价时返回 null', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      })),
    };
    const db = {
      transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
    };
    const service = new LlmCostService(db as never);

    await expect(
      service.resolvePricing('tenant-1', 'missing'),
    ).resolves.toBeNull();
  });
});
