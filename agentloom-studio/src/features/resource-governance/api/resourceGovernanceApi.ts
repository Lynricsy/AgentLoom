import { apiClient, toSnakeBody } from '@/shared/api/client'
import type {
  ResourceGovernanceActionResponse,
  ResourceGovernanceState,
  TerminateExecutionResponse,
  TerminateGovernedExecutionInput,
  TenantQuota,
  UpdateExecutionGovernanceControlsInput,
  UpdateTenantQuotaInput,
} from '../types/resourceGovernance'

interface ApiResponse<T> {
  data: T
}

export async function fetchResourceGovernance(
  organizationId: string,
): Promise<ResourceGovernanceState> {
  const response = await apiClient
    .get(`organizations/${organizationId}/resource-governance`)
    .json<ApiResponse<ResourceGovernanceState>>()

  return response.data
}

export async function updateTenantQuota(
  organizationId: string,
  input: UpdateTenantQuotaInput,
): Promise<TenantQuota> {
  const response = await apiClient
    .put(`organizations/${organizationId}/resource-governance/quota`, {
      json: toSnakeBody(input),
    })
    .json<ApiResponse<TenantQuota>>()

  return response.data
}

export async function updateExecutionGovernanceControls(
  organizationId: string,
  input: UpdateExecutionGovernanceControlsInput,
): Promise<ResourceGovernanceActionResponse> {
  const response = await apiClient
    .put(`organizations/${organizationId}/resource-governance/controls`, {
      json: toSnakeBody(input),
    })
    .json<ApiResponse<ResourceGovernanceActionResponse>>()

  return response.data
}

export async function terminateGovernedExecution(
  organizationId: string,
  input: TerminateGovernedExecutionInput,
): Promise<TerminateExecutionResponse> {
  const response = await apiClient
    .post(
      `organizations/${organizationId}/resource-governance/executions/${input.executionId}/terminate`,
      {
        json: toSnakeBody({ reason: input.reason }),
      },
    )
    .json<ApiResponse<TerminateExecutionResponse>>()

  return response.data
}
