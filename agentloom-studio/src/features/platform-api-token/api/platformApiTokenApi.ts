import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'

import type {
  CreatePlatformApiTokenInput,
  CreatedPlatformApiToken,
  ListPlatformApiTokensParams,
  PlatformApiTokenListResult,
} from '../types'

const BASE_PATH = 'platform-api-tokens'

/**
 * ky 的全局 hook 只把**响应**从 snake_case 转成 camelCase，请求侧不做转换，
 * 因此查询参数必须按服务端 `QueryPlatformApiTokenSchema` 写成 snake_case
 * （`page_size`），请求体则统一走 `toSnakeBody`。
 */
export function buildPlatformApiTokenSearchParams(
  params: ListPlatformApiTokensParams = {},
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

export async function fetchPlatformApiTokens(
  params: ListPlatformApiTokensParams = {},
): Promise<PlatformApiTokenListResult> {
  return apiClient
    .get(BASE_PATH, { searchParams: buildPlatformApiTokenSearchParams(params) })
    .json<PlatformApiTokenListResult>()
}

/** 创建成功的响应里带明文 token，调用方必须立即展示且不得缓存 */
export async function createPlatformApiToken(
  input: CreatePlatformApiTokenInput,
): Promise<CreatedPlatformApiToken> {
  const response = await apiClient
    .post(BASE_PATH, { json: toSnakeBody(input) })
    .json<ApiResponse<CreatedPlatformApiToken>>()

  return response.data
}

/** 撤销后服务端返回 204；重复撤销返回 409 */
export async function revokePlatformApiToken(tokenId: string): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${tokenId}`)
}
