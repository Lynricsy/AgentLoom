import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  ApiKeyInfo,
  CreateLlmModelInput,
  LlmModelInfo,
  LlmProviderInfo,
  UpdateLlmModelInput,
} from '../types'

/** 获取所有模型列表 */
export async function fetchLlmModels(): Promise<LlmModelInfo[]> {
  const res = await apiClient.get('llm-models').json<ApiResponse<LlmModelInfo[]>>()
  return res.data
}

/** 获取单个模型详情 */
export async function fetchLlmModel(id: string): Promise<LlmModelInfo> {
  const res = await apiClient.get(`llm-models/${id}`).json<ApiResponse<LlmModelInfo>>()
  return res.data
}

/** 创建模型配置 */
export async function createLlmModel(config: CreateLlmModelInput): Promise<LlmModelInfo> {
  const res = await apiClient.post('llm-models', { json: toSnakeBody(config) }).json<ApiResponse<LlmModelInfo>>()
  return res.data
}

/** 更新模型配置 */
export async function updateLlmModel(id: string, config: UpdateLlmModelInput): Promise<LlmModelInfo> {
  const res = await apiClient.patch(`llm-models/${id}`, { json: toSnakeBody(config) }).json<ApiResponse<LlmModelInfo>>()
  return res.data
}

/** 获取 Provider 列表 */
export async function fetchLlmProviders(): Promise<LlmProviderInfo[]> {
  const res = await apiClient.get('llm-providers').json<ApiResponse<LlmProviderInfo[]>>()
  return res.data
}

export async function fetchApiKeys(): Promise<ApiKeyInfo[]> {
  const res = await apiClient.get('api-keys').json<ApiResponse<ApiKeyInfo[]>>()
  return res.data
}
