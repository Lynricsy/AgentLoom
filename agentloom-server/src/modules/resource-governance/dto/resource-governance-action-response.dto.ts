import type { ResourceGovernanceStateResponseDto } from './resource-governance-response.dto';

export type ResourceGovernanceActionType =
  | 'quota_update'
  | 'governance_update'
  | 'execution_termination';

export type ResourceGovernanceActionScope = 'tenant' | 'workflow' | 'execution';

export interface ResourceGovernanceAffectedSummaryDto {
  requested: number;
  affected: number;
  skipped: number;
  workflowTargetIds?: string[];
  executionId?: string;
  workflowId?: string;
  finalStatus?: string;
  timelineUrl?: string;
}

export interface ResourceGovernanceActionResponseDto {
  organizationId: string;
  action: ResourceGovernanceActionType;
  scope: ResourceGovernanceActionScope;
  requestedAt: string;
  effectedAt: string;
  operator: string | null;
  reason: string | null;
  effectiveState: ResourceGovernanceStateResponseDto;
  affectedSummary: ResourceGovernanceAffectedSummaryDto;
  metadata: Record<string, unknown>;
}

export interface TerminatedExecutionSummaryDto {
  id: string;
  workflowId: string;
  status: string;
  timelineUrl: string;
}

export interface TerminateExecutionResponseDto extends ResourceGovernanceActionResponseDto {
  action: 'execution_termination';
  scope: 'execution';
  executionId: string;
  workflowId: string;
  execution: TerminatedExecutionSummaryDto;
}
