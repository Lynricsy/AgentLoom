import type { ResourceGovernanceEffectiveState } from './resource-governance.exceptions';
import type { AuditActorType } from '../../database/schema';
import type {
  ExecutionGovernanceControlsResponseDto,
  TenantQuotaResponseDto,
} from './dto/resource-governance-response.dto';
import type {
  ResourceGovernanceDecisionCategory,
  ResourceGovernanceDecisionScope,
} from './resource-governance.exceptions';

export const ResourceGovernanceEventName = {
  QUOTA_UPDATED: 'resource-governance.quota.updated',
  CONTROLS_UPDATED: 'resource-governance.controls.updated',
  EXECUTION_START_BLOCKED: 'resource-governance.execution-start.blocked',
  EXECUTION_TERMINATED: 'resource-governance.execution.terminated',
} as const;

export interface ResourceGovernanceEventActor {
  actorId: string | null;
  actorType: AuditActorType;
}

export interface ResourceGovernanceQuotaUpdatedEvent {
  tenantId: string;
  organizationId: string;
  previousQuota: TenantQuotaResponseDto;
  quota: TenantQuotaResponseDto;
  requestedAt: string;
  effectedAt: string;
  actor: ResourceGovernanceEventActor;
}

export interface ResourceGovernanceControlsUpdatedEvent {
  tenantId: string;
  organizationId: string;
  previousGovernance: ExecutionGovernanceControlsResponseDto;
  governance: ExecutionGovernanceControlsResponseDto;
  requestedAt: string;
  effectedAt: string;
  actor: ResourceGovernanceEventActor;
}

export interface ResourceGovernanceExecutionStartBlockedEvent {
  tenantId: string;
  organizationId: string;
  workflowId: string;
  category: ResourceGovernanceDecisionCategory;
  scope: ResourceGovernanceDecisionScope;
  reason: string;
  blockedAt: string;
  actor: ResourceGovernanceEventActor;
  effectiveState: ResourceGovernanceEffectiveState;
}

export interface ResourceGovernanceExecutionTerminatedEvent {
  tenantId: string;
  organizationId: string;
  executionId: string;
  workflowId: string;
  reason: string;
  requestedAt: string;
  effectedAt: string;
  actor: ResourceGovernanceEventActor;
}
