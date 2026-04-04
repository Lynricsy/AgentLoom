import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  CreateSharePayload,
  ImportAgentShareResponse,
  ListSharesParams,
  PublicShareData,
  ShareListResponse,
  ShareRecord,
  ShareResourceType,
} from '../types'

function resolveShareBasePath(resourceType: ShareResourceType): string {
  return resourceType === 'agent' ? 'agent-shares' : 'workflow-shares'
}

export async function createShare(
  payload: CreateSharePayload,
): Promise<ShareRecord> {
  const resourceType: ShareResourceType =
    'agentDefinitionId' in payload ? 'agent' : 'workflow'

  const response = await apiClient
    .post(resolveShareBasePath(resourceType), {
      json: toSnakeBody(payload),
    })
    .json<ApiResponse<ShareRecord>>()

  return response.data
}

export async function listShares(
  params: ListSharesParams,
): Promise<ShareListResponse> {
  const definitionKey =
    params.resourceType === 'agent'
      ? 'agent_definition_id'
      : 'workflow_definition_id'

  return apiClient
    .get(resolveShareBasePath(params.resourceType), {
      searchParams: {
        [definitionKey]: params.resourceId,
        page: params.page ?? 1,
        page_size: params.pageSize ?? 20,
      },
    })
    .json<ShareListResponse>()
}

export async function revokeShare(
  resourceType: ShareResourceType,
  shareId: string,
): Promise<void> {
  await apiClient.delete(`${resolveShareBasePath(resourceType)}/${shareId}`)
}

export async function getPublicShare(
  token: string,
): Promise<PublicShareData> {
  return apiClient.get(`s/${token}`).json<PublicShareData>()
}

export async function importAgentShare(
  token: string,
): Promise<ImportAgentShareResponse> {
  const response = await apiClient
    .post(`agent-shares/${token}/import`)
    .json<ApiResponse<ImportAgentShareResponse>>()

  return response.data
}
