import {
  OPTIMIZATION_EVIDENCE_WINDOW_DAYS,
  OPTIMIZATION_ROUTING_FALLBACK_RATE_MIN,
  OPTIMIZATION_ROUTING_MIN_DECISIONS,
} from '../optimization-proposal.constants';
import { buildProposalEvidence, formatPercent } from './team-analyzer.factory';
import type { RoutingAnalyzer } from './optimization-analyzer.types';

/**
 * LLM 路由频繁回退且未配置回退模型 → 把回退模型设为非回退决策中最常选中的模型
 * （并列取 id 字典序最小，保证确定性）。
 */
export const routingFallbackModelAnalyzer: RoutingAnalyzer = (evidence) => {
  if (evidence.strategy !== 'llm_as_router' || !evidence.strategyConfigPath) {
    return null;
  }
  const configured = evidence.strategyConfig?.fallbackModelId;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return null;
  }
  const sampleCount = evidence.decisions.length;
  if (sampleCount < OPTIMIZATION_ROUTING_MIN_DECISIONS) {
    return null;
  }
  const fallbackIds = evidence.decisions
    .filter((decision) => decision.fallbackReason !== null)
    .map((decision) => decision.id);
  const rate = fallbackIds.length / sampleCount;
  if (rate < OPTIMIZATION_ROUTING_FALLBACK_RATE_MIN) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const decision of evidence.decisions) {
    if (decision.fallbackReason === null && decision.selectedModelId) {
      counts.set(
        decision.selectedModelId,
        (counts.get(decision.selectedModelId) ?? 0) + 1,
      );
    }
  }
  let proposed: string | null = null;
  let proposedCount = 0;
  for (const [modelId, count] of counts) {
    if (
      count > proposedCount ||
      (count === proposedCount && proposed !== null && modelId < proposed)
    ) {
      proposed = modelId;
      proposedCount = count;
    }
  }
  if (proposed === null) {
    return null;
  }

  const modelName = evidence.modelNames.get(proposed) ?? proposed;
  return {
    proposalType: 'routing_fallback_model',
    configPath: `${evidence.strategyConfigPath}.fallbackModelId`,
    currentValue: null,
    proposedValue: proposed,
    rationale: `最近 ${OPTIMIZATION_EVIDENCE_WINDOW_DAYS} 天 ${sampleCount} 次路由决策中 ${fallbackIds.length} 次回退（${formatPercent(rate)}%），建议把回退模型设为历史最常选中的「${modelName}」`,
    evidence: {
      ...buildProposalEvidence(evidence.window, sampleCount, fallbackIds),
      modelName,
    },
  };
};
