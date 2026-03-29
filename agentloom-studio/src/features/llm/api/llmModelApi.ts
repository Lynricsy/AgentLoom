import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  ApiKeyInfo,
  CreateLlmModelInput,
  FetchModelsInput,
  LlmModelInfo,
  LlmProviderInfo,
  PrivateCloudModelInfo,
  TestConnectionInput,
  TestConnectionResult,
  UpdateLlmModelInput,
} from '../types'

export async function fetchLlmModels(): Promise<LlmModelInfo[]> {
  const res = await apiClient.get('llm-models').json<ApiResponse<LlmModelInfo[]>>()
  return res.data
}

export async function fetchLlmModel(id: string): Promise<LlmModelInfo> {
  const res = await apiClient.get(`llm-models/${id}`).json<ApiResponse<LlmModelInfo>>()
  return res.data
}

export async function createLlmModel(config: CreateLlmModelInput): Promise<LlmModelInfo> {
  const res = await apiClient.post('llm-models', { json: config }).json<ApiResponse<LlmModelInfo>>()
  return res.data
}

export async function updateLlmModel(id: string, config: UpdateLlmModelInput): Promise<LlmModelInfo> {
  const res = await apiClient.patch(`llm-models/${id}`, { json: config }).json<ApiResponse<LlmModelInfo>>()
  return res.data
}

export async function deleteLlmModel(id: string): Promise<void> {
  await apiClient.delete(`llm-models/${id}`)
}

export async function fetchLlmProviders(): Promise<LlmProviderInfo[]> {
  const res = await apiClient.get('llm-providers').json<ApiResponse<LlmProviderInfo[]>>()
  return res.data
}

export async function fetchApiKeys(): Promise<ApiKeyInfo[]> {
  const res = await apiClient.get('api-keys').json<ApiResponse<ApiKeyInfo[]>>()
  return res.data
}

export async function testPrivateCloudConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
  const res = await apiClient.post('llm/test-connection', { json: input }).json<ApiResponse<TestConnectionResult>>()
  return res.data
}

export async function fetchPrivateCloudModels(input: FetchModelsInput): Promise<PrivateCloudModelInfo[]> {
  const res = await apiClient.post('llm/private-cloud/models', { json: input }).json<ApiResponse<PrivateCloudModelInfo[]>>()
  return res.data
}
