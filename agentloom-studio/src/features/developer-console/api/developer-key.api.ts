import { apiClient } from '@/shared/api/client'
import type { PaginatedResponse } from '@/shared/types/api'
import type {
  DeveloperKey,
  DeveloperKeyListParams,
  RegisterDeveloperKeyPayload,
} from '../types'

const DEVELOPER_KEYS_PATH = 'plugins/developer-keys'

export async function fetchDeveloperKeys(
  params: DeveloperKeyListParams,
): Promise<PaginatedResponse<DeveloperKey>> {
  const searchParams: Record<string, string> = {}
  if (params.status) searchParams.status = params.status
  if (params.page) searchParams.page = String(params.page)
  if (params.pageSize) searchParams.pageSize = String(params.pageSize)

  return apiClient
    .get(DEVELOPER_KEYS_PATH, { searchParams })
    .json<PaginatedResponse<DeveloperKey>>()
}

export async function registerDeveloperKey(
  payload: RegisterDeveloperKeyPayload,
): Promise<DeveloperKey> {
  return apiClient
    .post(DEVELOPER_KEYS_PATH, { json: payload })
    .json<DeveloperKey>()
}

/** 撤销返回 200 并携带被撤销的密钥（不是 204），重复撤销服务端回 400。 */
export async function revokeDeveloperKey(keyId: string): Promise<DeveloperKey> {
  return apiClient
    .delete(`${DEVELOPER_KEYS_PATH}/${keyId}`)
    .json<DeveloperKey>()
}
