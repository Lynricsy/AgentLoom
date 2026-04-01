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

export interface UpdateUserPreferenceInput {
  titleModelConfigId?: string | null
}

export async function fetchUserPreference(): Promise<UserPreference> {
  const res = await apiClient.get('user-preferences').json<ApiResponse<UserPreference>>()
  return res.data
}

export async function updateUserPreference(input: UpdateUserPreferenceInput): Promise<UserPreference> {
  const res = await apiClient.patch('user-preferences', { json: input }).json<ApiResponse<UserPreference>>()
  return res.data
}
