import type { StrategyFn } from './types';

export const costOptimized: StrategyFn = (candidates, context) => {
  const estimatedOutputTokens = context.inputTokenCount * 0.5;

  return candidates
    .map((c) => {
      const inputCost =
        (context.inputTokenCount / 1000) * c.routingMeta.costPer1kInputTokens;
      const outputCost =
        (estimatedOutputTokens / 1000) * c.routingMeta.costPer1kOutputTokens;
      const totalCost = inputCost + outputCost;

      const maxCost = Math.max(
        ...candidates.map((m) => {
          const ic =
            (context.inputTokenCount / 1000) *
            m.routingMeta.costPer1kInputTokens;
          const oc =
            (estimatedOutputTokens / 1000) *
            m.routingMeta.costPer1kOutputTokens;
          return ic + oc;
        }),
        0.0001,
      );

      const score = Math.round(100 * (1 - totalCost / maxCost));

      return {
        modelId: c.id,
        modelName: c.name,
        provider: c.provider,
        score: Math.max(score, 0),
        reasoning: `预估成本 $${totalCost.toFixed(6)}（输入 $${inputCost.toFixed(6)} + 输出 $${outputCost.toFixed(6)}）`,
      };
    })
    .sort((a, b) => b.score - a.score);
};
