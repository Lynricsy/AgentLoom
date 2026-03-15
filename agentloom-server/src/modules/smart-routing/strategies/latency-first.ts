import type { StrategyFn } from './types';

export const latencyFirst: StrategyFn = (candidates) => {
  const maxLatency = Math.max(
    ...candidates.map((c) => c.routingMeta.avgLatencyMs),
    1,
  );

  return candidates
    .map((c) => {
      const isFiniteLatency = Number.isFinite(c.routingMeta.avgLatencyMs);
      const score = isFiniteLatency
        ? Math.round(100 * (1 - c.routingMeta.avgLatencyMs / maxLatency))
        : 0;

      return {
        modelId: c.id,
        modelName: c.name,
        provider: c.provider,
        score: Math.max(score, 0),
        reasoning: isFiniteLatency
          ? `平均延迟 ${c.routingMeta.avgLatencyMs}ms`
          : '延迟未知',
      };
    })
    .sort((a, b) => b.score - a.score);
};
