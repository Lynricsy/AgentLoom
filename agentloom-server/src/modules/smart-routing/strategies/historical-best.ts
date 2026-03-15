import type { StrategyFn } from './types';

export const historicalBest: StrategyFn = (candidates, context) => {
  const metrics = context.historicalMetrics;

  return candidates
    .map((c) => {
      const modelMetrics = metrics?.[c.id];
      if (!modelMetrics) {
        return {
          modelId: c.id,
          modelName: c.name,
          provider: c.provider,
          score: c.routingMeta.qualityRank,
          reasoning: '无历史数据，回退使用质量排名',
        };
      }

      const successScore = modelMetrics.successRate * 50;
      const latencyScore =
        modelMetrics.avgLatencyMs > 0
          ? Math.max(0, 25 * (1 - modelMetrics.avgLatencyMs / 5000))
          : 25;
      const tokenScore =
        modelMetrics.avgTokenUsage > 0
          ? Math.max(0, 25 * (1 - modelMetrics.avgTokenUsage / 10000))
          : 25;

      const score = Math.round(successScore + latencyScore + tokenScore);

      return {
        modelId: c.id,
        modelName: c.name,
        provider: c.provider,
        score: Math.min(score, 100),
        reasoning: `成功率 ${(modelMetrics.successRate * 100).toFixed(1)}%，平均延迟 ${modelMetrics.avgLatencyMs.toFixed(0)}ms，平均 token 用量 ${modelMetrics.avgTokenUsage.toFixed(0)}`,
      };
    })
    .sort((a, b) => b.score - a.score);
};
