/**
 * LLM 调用成本：按 `llm_model_configs.pricing`（USD / 1M tokens）把 token 用量换算为美元。
 * 成本只在服务端计算，模型配置未定价时返回 null（区分“免费”与“未知”）。
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  llmModelConfigs,
  type ModelPricing,
  type PricingTier,
} from '../../database/schema/llm-model-configs.schema';
import type { AgentUsage } from '../agent/types/agent-event.types';

/** 定价进程内缓存时长 */
export const LLM_PRICING_CACHE_TTL_MS = 60_000;

/**
 * 估算一次（或累加后的）调用成本，单位 USD，四舍六入保留 6 位小数。
 * - 阶梯价：取 `aboveTokens <= inputTokens` 的最高档，否则用基础价；
 * - 缓存读/写 token 缺少专门单价时按输入单价计。
 */
export function estimateCostUsd(
  pricing: ModelPricing | null,
  usage: AgentUsage,
): number | null {
  if (!pricing) {
    return null;
  }
  const tier = (pricing.tiers ?? [])
    .filter((candidate) => candidate.aboveTokens <= usage.inputTokens)
    .reduce<PricingTier | undefined>(
      (best, candidate) =>
        !best || candidate.aboveTokens > best.aboveTokens ? candidate : best,
      undefined,
    );
  const rate = tier ?? pricing;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  const uncachedInputTokens = Math.max(0, usage.inputTokens - cacheReadTokens);
  const cost =
    uncachedInputTokens * rate.inputPer1MTokens +
    cacheReadTokens * (rate.cachedReadPer1MTokens ?? rate.inputPer1MTokens) +
    cacheWriteTokens * (rate.cachedWritePer1MTokens ?? rate.inputPer1MTokens) +
    usage.outputTokens * rate.outputPer1MTokens;
  return roundHalfEvenMicros(cost / 1_000_000);
}

/** 银行家舍入（四舍六入五成双）到 1e-6 */
function roundHalfEvenMicros(value: number): number {
  const scaled = value * 1_000_000;
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;
  const rounded =
    Math.abs(fraction - 0.5) < 1e-9
      ? floor % 2 === 0
        ? floor
        : floor + 1
      : Math.round(scaled);
  return rounded / 1_000_000;
}

@Injectable()
export class LlmCostService {
  private readonly pricingCache = new Map<
    string,
    { pricing: ModelPricing | null; expiresAt: number }
  >();

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  estimateCostUsd(
    pricing: ModelPricing | null,
    usage: AgentUsage,
  ): number | null {
    return estimateCostUsd(pricing, usage);
  }

  /** 读取模型配置定价；在已有租户事务内调用时复用该事务。 */
  async resolvePricing(
    tenantId: string,
    llmModelConfigId: string,
  ): Promise<ModelPricing | null> {
    const cacheKey = `${tenantId}:${llmModelConfigId}`;
    const cached = this.pricingCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.pricing;
    }

    const [row] = await runInTenantTransaction(this.db, tenantId, (dbClient) =>
      dbClient
        .select({ pricing: llmModelConfigs.pricing })
        .from(llmModelConfigs)
        .where(
          and(
            eq(llmModelConfigs.id, llmModelConfigId),
            eq(llmModelConfigs.tenantId, tenantId),
          ),
        )
        .limit(1),
    );
    const pricing = row?.pricing ?? null;
    this.pricingCache.set(cacheKey, {
      pricing,
      expiresAt: now + LLM_PRICING_CACHE_TTL_MS,
    });
    return pricing;
  }
}
