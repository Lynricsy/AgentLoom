/**
 * LLM 成本换算：基础价、阶梯价、缓存读写价、未定价返回 null，以及定价缓存。
 */
import { describe, expect, it, vi } from 'vitest';

import type { ModelPricing } from '../../../database/schema/llm-model-configs.schema';
import { estimateCostUsd, LlmCostService } from '../llm-cost.service';

describe('estimateCostUsd', () => {
  const basePricing: ModelPricing = {
    inputPer1MTokens: 3,
    outputPer1MTokens: 15,
  };

  it('未定价返回 null', () => {
    expect(
      estimateCostUsd(null, {
        inputTokens: 100,
        outputTokens: 10,
        totalTokens: 110,
      }),
    ).toBeNull();
  });

  it('按基础价换算并保留 6 位小数', () => {
    // 1000 * 3 + 500 * 15 = 10500 → 0.0105
    expect(
      estimateCostUsd(basePricing, {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      }),
    ).toBe(0.0105);
  });

  it('缓存读写有专门单价时分别计价，缺失时回退输入单价', () => {
    const pricing: ModelPricing = {
      ...basePricing,
      cachedReadPer1MTokens: 0.3,
    };
    // (1000-400)*3 + 400*0.3 + 200*3 + 100*15 = 1800 + 120 + 600 + 1500 = 4020
    expect(
      estimateCostUsd(pricing, {
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadTokens: 400,
        cacheWriteTokens: 200,
        totalTokens: 1100,
      }),
    ).toBe(0.00402);
  });

  it('阶梯价取 aboveTokens <= inputTokens 的最高档', () => {
    const pricing: ModelPricing = {
      ...basePricing,
      tiers: [
        { aboveTokens: 200_000, inputPer1MTokens: 6, outputPer1MTokens: 22.5 },
        { aboveTokens: 100_000, inputPer1MTokens: 4, outputPer1MTokens: 20 },
      ],
    };
    // 未达任何档：基础价 1000*3 = 3000
    expect(
      estimateCostUsd(pricing, {
        inputTokens: 1000,
        outputTokens: 0,
        totalTokens: 1000,
      }),
    ).toBe(0.003);
    // 250k 命中 200k 档：250000*6 + 1000*22.5 = 1522500
    expect(
      estimateCostUsd(pricing, {
        inputTokens: 250_000,
        outputTokens: 1000,
        totalTokens: 251_000,
      }),
    ).toBe(1.5225);
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
