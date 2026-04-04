import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type { ResourceSourceKind } from '@/shared/lib/resourceSource'

export type ResourceSourceResourceType =
  | 'agent_definition'
  | 'knowledge_base'
  | 'memory_instance'
  | 'mcp_server_config'
  | 'skill'
  | 'workflow_definition'

export interface ConvertResourceSourceResponse {
  resourceType: ResourceSourceResourceType
  resourceId: string
  currentKind: ResourceSourceKind
}

export async function convertResourceSourceToManual(
  resourceType: ResourceSourceResourceType,
  resourceId: string,
): Promise<ConvertResourceSourceResponse> {
  const response = await apiClient
    .post(`resource-sources/${resourceType}/${resourceId}/convert-to-manual`)
    .json<ApiResponse<ConvertResourceSourceResponse>>()

  return response.data
}
