import { apiClient } from '@/shared/api/client'
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api'
import type { LlmModelInfo, LlmModelConfig, LlmProviderInfo } from '../types'

/** 获取所有模型列表 */
export async function fetchLlmModels(): Promise<LlmModelInfo[]> {
  const res = await apiClient.get('llm-models').json<PaginatedResponse<LlmModelInfo>>()
  return res.data
}

/** 获取单个模型详情 */
export async function fetchLlmModel(id: string): Promise<LlmModelInfo> {
  const res = await apiClient.get(`llm-models/${id}`).json<ApiResponse<LlmModelInfo>>()
  return res.data
}

/** 创建模型配置 */
export async function createLlmModel(config: LlmModelConfig): Promise<LlmModelInfo> {
  const res = await apiClient.post('llm-models', { json: config }).json<ApiResponse<LlmModelInfo>>()
  return res.data
}

/** 更新模型配置 */
export async function updateLlmModel(id: string, config: Partial<LlmModelConfig>): Promise<LlmModelInfo> {
  const res = await apiClient.patch(`llm-models/${id}`, { json: config }).json<ApiResponse<LlmModelInfo>>()
  return res.data
}

/** 获取 Provider 列表 */
export async function fetchLlmProviders(): Promise<LlmProviderInfo[]> {
  const res = await apiClient.get('llm-providers').json<ApiResponse<LlmProviderInfo[]>>()
  return res.data
}
