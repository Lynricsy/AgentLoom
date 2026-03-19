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

export interface UpdateTenantQuotaInput {
  apiRateLimitPerMinute?: number
  maxConcurrentExecutions?: number | null
  dailyExecutionLimit?: number | null
  dailyApiCallLimit?: number | null
  storageQuotaMb?: number | null
  maxSandboxCpuPercent?: number | null
  maxSandboxMemoryMb?: number | null
}

export interface TenantExecutionGovernanceControlInput {
  status: ExecutionGovernanceState
  reason: string | null
}

export interface WorkflowExecutionGovernanceControlInput {
  scope: 'workflow'
  targetId: string
  status: ExecutionGovernanceState
  reason: string | null
}

export interface UpdateExecutionGovernanceControlsInput {
  tenantControl?: TenantExecutionGovernanceControlInput
  workflowControls?: WorkflowExecutionGovernanceControlInput[]
}

export interface TerminateGovernedExecutionInput {
  executionId: string
  reason: string
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
