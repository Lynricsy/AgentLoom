import type { StrategyFn } from './types';

export const tokenOptimized: StrategyFn = (candidates, context) => {
  const inputTokenCount = context.inputTokenCount;
  const tokenThreshold = context.tokenThreshold ?? 4096;
  const shortInput = inputTokenCount <= tokenThreshold;
  const fittingCandidates = candidates.filter(
    (candidate) => candidate.routingMeta.contextWindow >= inputTokenCount,
  );
  const hasFittingCandidate = fittingCandidates.length > 0;
  const maxContextWindow = Math.max(
    ...candidates.map((candidate) => candidate.routingMeta.contextWindow),
    1,
  );
  const fittingHeadrooms = fittingCandidates.map(
    (candidate) => candidate.routingMeta.contextWindow - inputTokenCount,
  );
  const maxHeadroom = Math.max(...fittingHeadrooms, 1);
  const minHeadroom = Math.min(...fittingHeadrooms, 0);

  return candidates
    .map((candidate) => {
      const contextWindow = candidate.routingMeta.contextWindow;
      const fits = contextWindow >= inputTokenCount;

      if (!hasFittingCandidate) {
        const score = Math.round((contextWindow / maxContextWindow) * 100);

        return {
          modelId: candidate.id,
          modelName: candidate.name,
          provider: candidate.provider,
          score,
          reasoning: `警告：所有模型的上下文窗口都不足以容纳 ${inputTokenCount} tokens 输入，已回退选择上下文窗口更大的模型；当前窗口 ${contextWindow} tokens。`,
        };
      }

      if (!fits) {
        return {
          modelId: candidate.id,
          modelName: candidate.name,
          provider: candidate.provider,
          score: 0,
          reasoning: `上下文窗口 ${contextWindow} tokens 不足以容纳 ${inputTokenCount} tokens 输入。`,
        };
      }

      const headroom = contextWindow - inputTokenCount;
      const score = shortInput
        ? (() => {
            if (maxHeadroom === minHeadroom) {
              return 100;
            }

            const normalized =
              1 - (headroom - minHeadroom) / (maxHeadroom - minHeadroom);

            return Math.round(30 + 70 * normalized);
          })()
        : Math.round(30 + 70 * (headroom / maxHeadroom));

      return {
        modelId: candidate.id,
        modelName: candidate.name,
        provider: candidate.provider,
        score,
        reasoning: shortInput
          ? `短文本路由：输入 ${inputTokenCount} tokens 未超过阈值 ${tokenThreshold}，优先选择贴合度更高的上下文窗口；当前窗口 ${contextWindow} tokens，剩余空间 ${headroom} tokens。`
          : `长文本路由：输入 ${inputTokenCount} tokens 超过阈值 ${tokenThreshold}，优先选择更大的上下文余量；当前窗口 ${contextWindow} tokens，剩余空间 ${headroom} tokens。`,
      };
    })
    .sort((a, b) => b.score - a.score);
};
