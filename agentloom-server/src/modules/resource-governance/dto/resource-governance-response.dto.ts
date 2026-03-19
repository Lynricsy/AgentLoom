export type ExecutionGovernanceState = 'active' | 'paused';
export type GovernancePauseScope = 'tenant' | 'workflow';

export type TenantQuotaMetricKey =
  | 'maxConcurrentExecutions'
  | 'dailyExecutionLimit'
  | 'dailyApiCallLimit'
  | 'storageQuotaMb'
  | 'apiRateLimitPerMinute'
  | 'maxSandboxCpuPercent'
  | 'maxSandboxMemoryMb';

export interface GovernancePauseStateDto {
  scope: GovernancePauseScope;
  targetId: string;
  status: ExecutionGovernanceState;
  reason: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface TenantQuotaResponseDto {
  organizationId: string;
  tenantId: string;
  apiRateLimitPerMinute: number;
  maxConcurrentExecutions: number | null;
  dailyExecutionLimit: number | null;
  dailyApiCallLimit: number | null;
  storageQuotaMb: number | null;
  maxSandboxCpuPercent: number | null;
  maxSandboxMemoryMb: number | null;
  version: number;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExecutionGovernanceControlsResponseDto {
  organizationId: string;
  tenantId: string;
  tenantControl: GovernancePauseStateDto;
  workflowControls: GovernancePauseStateDto[];
  version: number;
}

export interface ResourceGovernanceStateResponseDto {
  organizationId: string;
  quota: TenantQuotaResponseDto;
  governance: ExecutionGovernanceControlsResponseDto;
}
