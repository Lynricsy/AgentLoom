import type { UpdateUserPreferenceDto } from '@agentloom/api-client'
import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'

export interface UserPreference {
  id: string
  userId: string
  tenantId: string
  titleModelConfigId: string | null
  preferences: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/**
 * PATCH /user-preferences 请求体（生成模型）。
 * 原手写类型漏掉了 server 也接受的 `preferences`；
 * 这里把它收窄为 `Record<string, unknown>`（生成产物是无约束索引签名）。
 */
export type UpdateUserPreferenceInput = Omit<UpdateUserPreferenceDto, 'preferences'> & {
  preferences?: Record<string, unknown>
}

export async function fetchUserPreference(): Promise<UserPreference> {
  const res = await apiClient.get('user-preferences').json<ApiResponse<UserPreference>>()
  return res.data
}

export async function updateUserPreference(input: UpdateUserPreferenceInput): Promise<UserPreference> {
  const res = await apiClient.patch('user-preferences', { json: input }).json<ApiResponse<UserPreference>>()
  return res.data
}
