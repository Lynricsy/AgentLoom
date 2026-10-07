import { apiClient } from '@/shared/api/client'
import { uploadAlpPackage } from '@/features/plugin'
import type { PaginatedResponse } from '@/shared/types/api'
import type {
  RuntimePluginListParams,
  RuntimePluginRecord,
  RuntimePluginStatus,
} from '../types'

export async function fetchRuntimePlugins(
  params?: RuntimePluginListParams,
): Promise<PaginatedResponse<RuntimePluginRecord>> {
  // QueryRuntimePluginsSchema 与 QueryPluginsSchema 同为 camelCase 的 pageSize
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize))
  if (params?.search) searchParams.set('search', params.search)
  if (params?.status) searchParams.set('status', params.status)

  return apiClient
    .get('runtime-plugins', { searchParams })
    .json<PaginatedResponse<RuntimePluginRecord>>()
}

export async function fetchRuntimePlugin(
  id: string,
): Promise<{ data: RuntimePluginRecord }> {
  return apiClient.get(`runtime-plugins/${id}`).json<{ data: RuntimePluginRecord }>()
}

export interface RegisterRuntimePluginPayload {
  file: File
  /** 注册后立刻切换到的状态，省略则服务端保持 registered */
  status?: Extract<RuntimePluginStatus, 'registered' | 'active'>
  /** 上传字节进度（0-100） */
  onProgress?: (percent: number) => void
}

/** 上传 .alp runtime 插件包；上传、进度与 401 刷新语义与节点插件一致 */
export async function registerRuntimePlugin(
  payload: RegisterRuntimePluginPayload,
): Promise<RuntimePluginRecord> {
  return uploadAlpPackage<RuntimePluginRecord>('runtime-plugins', payload)
}

export async function updateRuntimePluginStatus(
  id: string,
  payload: { status: RuntimePluginStatus; occVersion: number },
): Promise<{ data: RuntimePluginRecord }> {
  // UpdateRuntimePluginStatusSchema 是 .strict() 的 camelCase schema，原样发送
  return apiClient
    .patch(`runtime-plugins/${id}/status`, { json: payload })
    .json<{ data: RuntimePluginRecord }>()
}

export async function deleteRuntimePlugin(id: string): Promise<void> {
  await apiClient.delete(`runtime-plugins/${id}`)
}
