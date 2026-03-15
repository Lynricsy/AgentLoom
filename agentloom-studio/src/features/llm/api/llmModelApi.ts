import { apiClient, toSnakeBody } from '@/shared/api/client'
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
  const res = await apiClient.post('llm-models', { json: toSnakeBody(config) }).json<ApiResponse<LlmModelInfo>>()
  return res.data
}

export async function updateLlmModel(id: string, config: UpdateLlmModelInput): Promise<LlmModelInfo> {
  const res = await apiClient.patch(`llm-models/${id}`, { json: toSnakeBody(config) }).json<ApiResponse<LlmModelInfo>>()
  return res.data
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
  return apiClient.post('llm/test-connection', { json: toSnakeBody(input) }).json<TestConnectionResult>()
}

export async function fetchPrivateCloudModels(input: FetchModelsInput): Promise<PrivateCloudModelInfo[]> {
  return apiClient.post('llm/private-cloud/models', { json: toSnakeBody(input) }).json<PrivateCloudModelInfo[]>()
}
