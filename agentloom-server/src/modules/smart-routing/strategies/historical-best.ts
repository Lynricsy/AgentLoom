import type { StrategyFn } from './types';

export const historicalBest: StrategyFn = (candidates, context) => {
  const metrics = context.historicalMetrics;
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  if (
    !metrics ||
    candidates.every((candidate) => metrics[candidate.id] === undefined)
  ) {
    return candidates
      .map((candidate) => ({
        modelId: candidate.id,
        modelName: candidate.name,
        provider: candidate.provider,
        score: candidate.routingMeta.qualityRank,
        reasoning: '无历史数据，回退使用质量排名',
      }))
      .sort((a, b) => b.score - a.score);
  }

  const getLastUsedAt = (modelId: string): number => {
    const lastUsedAt = metrics?.[modelId]?.lastUsedAt;

    if (!lastUsedAt) {
      return 0;
    }

    const timestamp = new Date(lastUsedAt).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  return candidates
    .map((candidate) => {
      const modelMetrics = metrics?.[candidate.id];
      if (!modelMetrics) {
        return {
          modelId: candidate.id,
          modelName: candidate.name,
          provider: candidate.provider,
          score: candidate.routingMeta.qualityRank,
          reasoning: '缺少近 30 天历史数据，暂时按质量排名参与排序',
        };
      }

      return {
        modelId: candidate.id,
        modelName: candidate.name,
        provider: candidate.provider,
        score: Math.round(modelMetrics.successRate * 100),
        reasoning: `近 30 天成功率 ${(modelMetrics.successRate * 100).toFixed(1)}%，最近一次使用 ${modelMetrics.lastUsedAt ?? '未知'}，平均延迟 ${modelMetrics.avgLatencyMs.toFixed(0)}ms。`,
      };
    })
    .sort((a, b) => {
      const metricsA = metrics?.[a.modelId];
      const metricsB = metrics?.[b.modelId];

      if (metricsA && metricsB) {
        if (metricsB.successRate !== metricsA.successRate) {
          return metricsB.successRate - metricsA.successRate;
        }

        const lastUsedDiff = getLastUsedAt(b.modelId) - getLastUsedAt(a.modelId);
        if (lastUsedDiff !== 0) {
          return lastUsedDiff;
        }

        return (
          (candidateById.get(b.modelId)?.routingMeta.qualityRank ?? 0) -
          (candidateById.get(a.modelId)?.routingMeta.qualityRank ?? 0)
        );
      }

      if (metricsA) {
        return -1;
      }
      if (metricsB) {
        return 1;
      }

      return b.score - a.score;
    });
};
