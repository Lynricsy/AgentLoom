import type { TeamBudget } from '@agentloom/contracts';

import {
  OPTIMIZATION_ANALYZER_VERSION,
  OPTIMIZATION_EVIDENCE_WINDOW_DAYS,
  OPTIMIZATION_TEAM_FAILURE_RATE_MIN,
  OPTIMIZATION_TEAM_MIN_RUNS,
} from '../optimization-proposal.constants';
import type {
  OptimizationProposalType,
  ProposalEvidence,
} from '../optimization-proposal.types';
import type {
  EvidenceWindow,
  TeamAnalyzer,
  TeamRunEvidenceRow,
} from './optimization-analyzer.types';

const MAX_SAMPLE_IDS = 10;

export function buildProposalEvidence(
  window: EvidenceWindow,
  sampleCount: number,
  matchedIds: string[],
): ProposalEvidence {
  return {
    analyzerVersion: OPTIMIZATION_ANALYZER_VERSION,
    windowDays: OPTIMIZATION_EVIDENCE_WINDOW_DAYS,
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    sampleCount,
    matchedCount: matchedIds.length,
    matchedRate: sampleCount === 0 ? 0 : matchedIds.length / sampleCount,
    sampleIds: matchedIds.slice(0, MAX_SAMPLE_IDS),
  };
}

/** 百分比文案：整数显示为整数，否则保留一位小数 */
export function formatPercent(rate: number): string {
  const percent = Math.round(rate * 1000) / 10;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}

interface TeamBudgetAnalyzerDefinition {
  proposalType: OptimizationProposalType;
  field: keyof TeamBudget;
  /** 字段中文名 */
  fieldLabel: string;
  /** 失败原因中文描述，用于「因{原因}失败」 */
  reasonLabel: string;
  matches: (row: TeamRunEvidenceRow) => boolean;
  /** 返回 null 表示已到上限、不提案 */
  propose: (current: number) => number | null;
}

/**
 * 团队预算类分析器：样本足够且目标失败占比达阈值时，把对应预算字段放大。
 * 证据只来自与已发布配置同预算的终态运行（由分析服务过滤）。
 */
export function createTeamBudgetAnalyzer(
  definition: TeamBudgetAnalyzerDefinition,
): TeamAnalyzer {
  return (evidence) => {
    const sampleCount = evidence.runs.length;
    if (sampleCount < OPTIMIZATION_TEAM_MIN_RUNS) {
      return null;
    }
    const matchedIds = evidence.runs
      .filter(definition.matches)
      .map((row) => row.id);
    const rate = matchedIds.length / sampleCount;
    if (rate < OPTIMIZATION_TEAM_FAILURE_RATE_MIN) {
      return null;
    }
    const current = evidence.config.budget[definition.field];
    const proposed = definition.propose(current);
    if (proposed === null || proposed <= current) {
      return null;
    }
    return {
      proposalType: definition.proposalType,
      configPath: `config.budget.${definition.field}`,
      currentValue: current,
      proposedValue: proposed,
      rationale: `最近 ${OPTIMIZATION_EVIDENCE_WINDOW_DAYS} 天 ${sampleCount} 次团队运行中 ${matchedIds.length} 次因${definition.reasonLabel}失败（${formatPercent(rate)}%），建议把${definition.fieldLabel}从 ${current} 提高到 ${proposed}`,
      evidence: buildProposalEvidence(evidence.window, sampleCount, matchedIds),
    };
  };
}
