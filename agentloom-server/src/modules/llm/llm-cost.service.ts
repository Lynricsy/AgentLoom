/**
 * LLM 调用成本：按 `llm_model_configs.pricing`（USD / 1M tokens）把 token 用量换算为美元。
 * 成本只在服务端计算，模型配置未定价时返回 null（区分“免费”与“未知”）。
 *
 * 用量计数互不重叠（与 pi-ai `Usage`、dsh `TokenUsage` 一致）：`inputTokens` 是未缓存输入，
 * 缓存读/写单独计数。阶梯价按单次调用的完整 prompt（未缓存 + 缓存读 + 缓存写）选择，
 * 所以必须逐次调用定价后求和，不能把多次调用的用量先累加再定价。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  llmModelConfigs,
  type ModelPricing,
  type PricingTier,
} from '../../database/schema/llm-model-configs.schema';
import { promptTokensOf } from '../agent/shared/agent-usage';
import type { AgentUsage } from '../agent/types/agent-event.types';

/** 定价进程内缓存时长 */
export const LLM_PRICING_CACHE_TTL_MS = 60_000;

/**
 * 估算一组 LLM 调用的总成本，单位 USD，四舍六入五成双保留 6 位小数。
 * - 每次调用单独选阶梯：取 `aboveTokens < 完整 prompt tokens` 的最高档（与 pi-ai
 *   `calculateCost` 及 LiteLLM `*_above_<n>_tokens` 的「超过」语义一致），否则用基础价；
 * - 缓存读/写 token 缺少专门单价时按输入单价计；
 * - 逐次成本求和后统一舍入。
 */
export function estimateCostUsdForCalls(
  pricing: ModelPricing | null,
  calls: readonly AgentUsage[],
): number | null {
  if (!pricing) {
    return null;
  }
  const cost = calls.reduce(
    (sum, usage) => sum + estimateCallCostPerMillion(pricing, usage),
    0,
  );
  return roundHalfEvenMicros(cost / 1_000_000);
}

/** 单次调用成本（未除以 1M、未舍入） */
function estimateCallCostPerMillion(
  pricing: ModelPricing,
  usage: AgentUsage,
): number {
  const promptTokens = promptTokensOf(usage);
  const tier = (pricing.tiers ?? [])
    .filter((candidate) => promptTokens > candidate.aboveTokens)
    .reduce<PricingTier | undefined>(
      (best, candidate) =>
        !best || candidate.aboveTokens > best.aboveTokens ? candidate : best,
      undefined,
    );
  const rate = tier ?? pricing;
  return (
    usage.inputTokens * rate.inputPer1MTokens +
    (usage.cacheReadTokens ?? 0) *
      (rate.cachedReadPer1MTokens ?? rate.inputPer1MTokens) +
    (usage.cacheWriteTokens ?? 0) *
      (rate.cachedWritePer1MTokens ?? rate.inputPer1MTokens) +
    usage.outputTokens * rate.outputPer1MTokens
  );
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
  private readonly logger = new Logger(LlmCostService.name);
  private readonly pricingCache = new Map<
    string,
    { pricing: ModelPricing | null; expiresAt: number }
  >();

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * 按模型配置定价换算一组调用的成本。无调用、无模型配置或定价查询失败时为 null：
   * 成本缺失不影响调用方落库。
   */
  async estimateCallsCostUsd(
    tenantId: string,
    llmModelConfigId: string | undefined,
    calls: readonly AgentUsage[],
  ): Promise<number | null> {
    if (!llmModelConfigId || calls.length === 0) {
      return null;
    }
    try {
      return estimateCostUsdForCalls(
        await this.resolvePricing(tenantId, llmModelConfigId),
        calls,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to resolve model pricing for ${llmModelConfigId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
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
