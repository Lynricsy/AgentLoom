import type {
  TerminateExecutionRequestDto,
  UpsertExecutionGovernanceControlsRequestDto,
  UpsertExecutionGovernanceControlsRequestDtoTenantControl,
  UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInner,
  UpsertTenantQuotaRequestDto,
} from '@agentloom/api-client'

export type ExecutionGovernanceState = 'active' | 'paused'
export type GovernancePauseScope = 'tenant' | 'workflow'

export interface GovernancePauseState {
  scope: GovernancePauseScope
  targetId: string
  status: ExecutionGovernanceState
  reason: string | null
  updatedAt: string | null
  updatedBy: string | null
}

export interface TenantQuota {
  organizationId: string
  tenantId: string
  apiRateLimitPerMinute: number
  maxConcurrentExecutions: number | null
  dailyExecutionLimit: number | null
  dailyApiCallLimit: number | null
  storageQuotaMb: number | null
  maxSandboxCpuPercent: number | null
  maxSandboxMemoryMb: number | null
  version: number
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

export interface ExecutionGovernanceControls {
  organizationId: string
  tenantId: string
  tenantControl: GovernancePauseState
  workflowControls: GovernancePauseState[]
  version: number
}

export interface ResourceGovernanceState {
  organizationId: string
  quota: TenantQuota
  governance: ExecutionGovernanceControls
}

/** PUT /resource-governance/quota 请求体（生成模型） */
export type UpdateTenantQuotaInput = UpsertTenantQuotaRequestDto

/** PUT /resource-governance/execution-controls 请求体各段（生成模型） */
export type TenantExecutionGovernanceControlInput =
  UpsertExecutionGovernanceControlsRequestDtoTenantControl

export type WorkflowExecutionGovernanceControlInput =
  UpsertExecutionGovernanceControlsRequestDtoWorkflowControlsInner

export type UpdateExecutionGovernanceControlsInput =
  UpsertExecutionGovernanceControlsRequestDto

/** POST /resource-governance/executions/:id/terminate 请求体（生成模型 + 路径参数） */
export type TerminateGovernedExecutionInput = TerminateExecutionRequestDto & {
  executionId: string
}

export type ResourceGovernanceActionType =
  | 'quota_update'
  | 'governance_update'
  | 'execution_termination'

export type ResourceGovernanceActionScope = 'tenant' | 'workflow' | 'execution'

export interface ResourceGovernanceAffectedSummary {
  requested: number
  affected: number
  skipped: number
  workflowTargetIds?: string[]
  executionId?: string
  workflowId?: string
  finalStatus?: string
  timelineUrl?: string
}

export interface ResourceGovernanceActionResponse {
  organizationId: string
  action: ResourceGovernanceActionType
  scope: ResourceGovernanceActionScope
  requestedAt: string
  effectedAt: string
  operator: string | null
  reason: string | null
  effectiveState: ResourceGovernanceState
  affectedSummary: ResourceGovernanceAffectedSummary
  metadata: Record<string, unknown>
}

export interface TerminatedExecutionSummary {
  id: string
  workflowId: string
  status: string
  timelineUrl: string
}

export interface TerminateExecutionResponse extends ResourceGovernanceActionResponse {
  action: 'execution_termination'
  scope: 'execution'
  executionId: string
  workflowId: string
  execution: TerminatedExecutionSummary
}
