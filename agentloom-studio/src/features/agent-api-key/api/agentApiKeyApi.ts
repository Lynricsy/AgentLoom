import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'

import type {
  AgentApiKeyListResult,
  CreateAgentApiKeyInput,
  CreatedAgentApiKey,
  ListAgentApiKeysParams,
} from '../types'

function apiKeysPath(agentId: string): string {
  return `agent-definitions/${agentId}/api-keys`
}

/**
 * ky 的全局 hook 只把**响应**转成 camelCase，请求侧不做转换：
 * 查询参数按服务端 `QueryAgentApiKeySchema` 写成 snake_case（`page_size`），
 * 请求体统一走 `toSnakeBody`。
 */
export function buildAgentApiKeySearchParams(
  params: ListAgentApiKeysParams = {},
): Record<string, string> {
  const searchParams: Record<string, string> = {}

  if (params.page != null) {
    searchParams.page = String(params.page)
  }

  if (params.pageSize != null) {
    searchParams.page_size = String(params.pageSize)
  }

  if (params.status) {
    searchParams.status = params.status
  }

  return searchParams
}

export async function fetchAgentApiKeys(
  agentId: string,
  params: ListAgentApiKeysParams = {},
): Promise<AgentApiKeyListResult> {
  return apiClient
    .get(apiKeysPath(agentId), {
      searchParams: buildAgentApiKeySearchParams(params),
    })
    .json<AgentApiKeyListResult>()
}

/** 创建成功的响应里带明文 key，调用方必须立即展示且不得缓存 */
export async function createAgentApiKey(
  agentId: string,
  input: CreateAgentApiKeyInput,
): Promise<CreatedAgentApiKey> {
  const response = await apiClient
    .post(apiKeysPath(agentId), { json: toSnakeBody(input) })
    .json<ApiResponse<CreatedAgentApiKey>>()

  return response.data
}

/** 吊销成功返回 204；服务端对已吊销的 Key 幂等处理 */
export async function revokeAgentApiKey(
  agentId: string,
  keyId: string,
): Promise<void> {
  await apiClient.delete(`${apiKeysPath(agentId)}/${keyId}`)
}
