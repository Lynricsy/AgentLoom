import type { TeamNodeConfig } from '@agentloom/contracts';

import type {
  OptimizationProposalType,
  ProposalEvidence,
} from '../optimization-proposal.types';

export interface EvidenceWindow {
  start: Date;
  end: Date;
}

export interface TeamRunEvidenceRow {
  id: string;
  status: string;
  failureReason: string | null;
  usedTotalTokens: number;
  messageCount: number;
  budgetMaxTotalTokens: number;
  budgetMaxMessages: number;
  deadlineMinutes: number;
}

/** 一个已发布 team 节点及其同预算下的终态团队运行 */
export interface TeamNodeEvidence {
  workflowDefinitionId: string;
  nodeId: string;
  baseVersionId: string;
  nodeData: Record<string, unknown>;
  /** 已发布配置（parse 后含默认值） */
  config: TeamNodeConfig;
  runs: TeamRunEvidenceRow[];
  window: EvidenceWindow;
}

export interface RoutingDecisionEvidenceRow {
  id: string;
  selectedModelId: string | null;
  fallbackReason: string | null;
}

/** 一个已发布 smart-routing 节点及其路由决策 */
export interface RoutingNodeEvidence {
  workflowDefinitionId: string;
  nodeId: string;
  baseVersionId: string;
  nodeData: Record<string, unknown>;
  /** 已归一化的策略名（normalizeSmartRoutingStrategyName） */
  strategy: string;
  strategyConfig: Record<string, unknown> | undefined;
  /** 节点 data 中 strategyConfig 的位置（相对 data 的点路径） */
  strategyConfigPath: string | null;
  decisions: RoutingDecisionEvidenceRow[];
  modelNames: Map<string, string>;
  window: EvidenceWindow;
}

export interface ProposalCandidate {
  proposalType: OptimizationProposalType;
  configPath: string;
  currentValue: unknown;
  proposedValue: unknown;
  rationale: string;
  evidence: ProposalEvidence;
}

export type TeamAnalyzer = (evidence: TeamNodeEvidence) => ProposalCandidate | null;
export type RoutingAnalyzer = (
  evidence: RoutingNodeEvidence,
) => ProposalCandidate | null;
