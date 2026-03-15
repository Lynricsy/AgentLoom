import type { StrategyFn } from './types';

export const qualityFirst: StrategyFn = (candidates) => {
  return candidates
    .map((c) => ({
      modelId: c.id,
      modelName: c.name,
      provider: c.provider,
      score: c.routingMeta.qualityRank,
      reasoning: `质量排名 ${c.routingMeta.qualityRank}/100`,
    }))
    .sort((a, b) => b.score - a.score);
};
