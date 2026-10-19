import { apiClient } from '@/shared/api/client'
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api'
import type {
  CreateInterventionPolicyData,
  InterventionPolicy,
  InterventionPolicyListResult,
  ResolvedInterventionPolicy,
  UpdateInterventionPolicyData,
} from '../types'

type InterventionPolicyListResponse =
  | ApiResponse<InterventionPolicy[]>
  | PaginatedResponse<InterventionPolicy>
  | InterventionPolicyListResult
  | InterventionPolicy[]

type InterventionPolicyDetailResponse = ApiResponse<InterventionPolicy> | InterventionPolicy

type ResolvedInterventionPolicyResponse =
  | ApiResponse<ResolvedInterventionPolicy>
  | ResolvedInterventionPolicy

function unwrapResponse<T>(response: ApiResponse<T> | T): T {
  if (typeof response === 'object' && response !== null && 'data' in response) {
    return response.data
  }

  return response
}

function normalizePolicyListResponse(
  response: InterventionPolicyListResponse,
): InterventionPolicyListResult {
  if (Array.isArray(response)) {
    return { data: response }
  }

  if ('meta' in response) {
    return {
      data: response.data,
      meta: response.meta,
    }
  }

  return {
    data: response.data,
  }
}

export async function fetchInterventionPolicies(
  workflowId: string,
): Promise<InterventionPolicyListResult> {
  const response = await apiClient
    .get(`workflow-definitions/${workflowId}/intervention-policies`)
    .json<InterventionPolicyListResponse>()

  return normalizePolicyListResponse(response)
}

export async function fetchResolvedInterventionPolicy(
  workflowId: string,
  nodeId?: string,
): Promise<ResolvedInterventionPolicy> {
  const response = await apiClient
    .get(`workflow-definitions/${workflowId}/intervention-policies/resolve`, nodeId
      ? {
          searchParams: {
            nodeId,
          },
        }
      : undefined)
    .json<ResolvedInterventionPolicyResponse>()

  return unwrapResponse(response)
}

export async function createInterventionPolicy(
  workflowId: string,
  data: CreateInterventionPolicyData,
): Promise<InterventionPolicy> {
  // 服务端 DTO 为 camelCase，不能经 toSnakeBody 转换（snake 键会被剥离或被 strict 拒绝）
  const response = await apiClient
    .post(`workflow-definitions/${workflowId}/intervention-policies`, {
      json: data,
    })
    .json<InterventionPolicyDetailResponse>()

  return unwrapResponse(response)
}

export async function updateInterventionPolicy(
  workflowId: string,
  policyId: string,
  data: UpdateInterventionPolicyData,
): Promise<InterventionPolicy> {
  // PATCH DTO 为 strict 且不含 nodeId（节点归属在创建时确定），只发送可更新字段
  const response = await apiClient
    .patch(`workflow-definitions/${workflowId}/intervention-policies/${policyId}`, {
      json: {
        allowedRoles: data.allowedRoles,
        timeoutSeconds: data.timeoutSeconds,
        timeoutAction: data.timeoutAction,
        escalateToRole: data.escalateToRole,
        notifyChannels: data.notifyChannels,
        version: data.version,
      },
    })
    .json<InterventionPolicyDetailResponse>()

  return unwrapResponse(response)
}

export async function deleteInterventionPolicy(
  workflowId: string,
  policyId: string,
): Promise<void> {
  await apiClient.delete(`workflow-definitions/${workflowId}/intervention-policies/${policyId}`)
}
