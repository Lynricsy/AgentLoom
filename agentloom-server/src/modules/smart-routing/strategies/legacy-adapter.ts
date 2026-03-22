import type { RoutingCandidate } from '../core/routing-candidate';
import type { RoutingContext } from '../core/routing-context';
import type { RoutingDecision } from '../core/routing-decision';
import type { ModelCandidate } from './types';
import type { RoutingContext as LegacyRoutingContext } from '../dto/routing-context.dto';

export function toLegacyCandidate(c: RoutingCandidate): ModelCandidate {
  return {
    id: c.id,
    name: c.name,
    provider: c.provider,
    routingMeta: {
      contextWindow: c.routingMeta.contextWindow,
      costPer1kInputTokens: c.routingMeta.costs.input,
      costPer1kOutputTokens: c.routingMeta.costs.output,
      qualityRank: c.routingMeta.qualityRank,
      avgLatencyMs: c.routingMeta.avgLatencyMs,
    },
  };
}

export function toLegacyContext(ctx: RoutingContext): LegacyRoutingContext {
  return {
    inputTokenCount: ctx.inputTokenCount,
    tokenThreshold: (ctx.strategyConfig as { tokenThreshold?: number })
      ?.tokenThreshold,
    taskType: ctx.taskCategory,
    historicalMetrics:
      ctx.historicalMetrics as LegacyRoutingContext['historicalMetrics'],
  };
}

export function toRoutingDecision(
  results: Array<{
    modelId: string;
    modelName: string;
    provider: string;
    score: number;
    reasoning: string;
  }>,
  routerType: string,
): RoutingDecision {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  return {
    selectedModelId: best?.modelId ?? null,
    scores: sorted.map((r) => ({
      modelId: r.modelId,
      modelName: r.modelName,
      provider: r.provider,
      score: r.score,
      reasoning: r.reasoning,
    })),
    reasoning: best?.reasoning ?? '无可用候选模型',
    routerType,
    latencyMs: 0,
  };
}
