import type { StrategyFn } from './types';

export const fallbackChain: StrategyFn = (candidates) => {
  return candidates.map((c, index) => ({
    modelId: c.id,
    modelName: c.name,
    provider: c.provider,
    score: Math.max(100 - index * 10, 0),
    reasoning: `回退链位置 #${index + 1}`,
  }));
};
