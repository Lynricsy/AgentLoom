import type { StrategyFn } from './types';

export const tokenOptimized: StrategyFn = (candidates, context) => {
  return candidates
    .map((c) => {
      const fits = c.routingMeta.contextWindow >= context.inputTokenCount;
      const headroom = fits
        ? c.routingMeta.contextWindow - context.inputTokenCount
        : 0;
      const maxHeadroom = Math.max(
        ...candidates.map((m) => m.routingMeta.contextWindow - context.inputTokenCount),
        1,
      );
      const score = fits ? Math.round(30 + 70 * (headroom / maxHeadroom)) : 0;

      return {
        modelId: c.id,
        modelName: c.name,
        provider: c.provider,
        score,
        reasoning: fits
          ? `上下文窗口 ${c.routingMeta.contextWindow} tokens，输入 ${context.inputTokenCount} tokens，剩余空间 ${headroom} tokens`
          : `上下文窗口 ${c.routingMeta.contextWindow} tokens 不足以容纳 ${context.inputTokenCount} tokens 输入`,
      };
    })
    .sort((a, b) => b.score - a.score);
};
