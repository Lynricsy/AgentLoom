import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { PaginatedResponse } from '@/shared/types/api'
import type { PluginRecord, PluginListItem, PluginStatus } from '../types'

export async function fetchPlugins(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: PluginStatus
}): Promise<PaginatedResponse<PluginListItem>> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize))
  if (params?.search) searchParams.set('search', params.search)
  if (params?.status) searchParams.set('status', params.status)

  return apiClient.get('plugins', { searchParams }).json<PaginatedResponse<PluginListItem>>()
}

export async function fetchPluginById(id: string): Promise<{ data: PluginRecord }> {
  return apiClient.get(`plugins/${id}`).json<{ data: PluginRecord }>()
}

export async function updatePluginStatus(
  id: string,
  payload: { status: PluginStatus; occVersion: number },
): Promise<{ data: PluginRecord }> {
  return apiClient
    .patch(`plugins/${id}/status`, { json: toSnakeBody(payload) })
    .json<{ data: PluginRecord }>()
}

export async function deletePlugin(id: string): Promise<void> {
  await apiClient.delete(`plugins/${id}`)
}
