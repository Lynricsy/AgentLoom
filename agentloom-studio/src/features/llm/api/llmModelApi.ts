import { apiClient } from "@/shared/api/client";
import type { ApiResponse } from "@/shared/types/api";
import type {
  ApiKeyInfo,
  ConnectionTestResult,
  CreateLlmModelInput,
  CreateLlmProviderInput,
  DiscoveredModel,
  FetchModelsInput,
  LiteLLMModelInfo,
  LlmModelConfigEntity,
  LlmProviderEntity,
  PrivateCloudModelInfo,
  TestConnectionInput,
  UpdateLlmModelInput,
  UpdateLlmProviderInput,
} from "../types";

// ============================================================================
// Provider API
// ============================================================================

/** 获取组织下所有 Provider (自动同步内置 provider) */
export async function fetchProviders(): Promise<LlmProviderEntity[]> {
  const res = await apiClient
    .get("llm-providers")
    .json<ApiResponse<LlmProviderEntity[]>>();
  return res.data;
}

/** 获取单个 Provider */
export async function fetchProvider(id: string): Promise<LlmProviderEntity> {
  const res = await apiClient
    .get(`llm-providers/${id}`)
    .json<ApiResponse<LlmProviderEntity>>();
  return res.data;
}

/** 创建自定义 Provider */
export async function createProvider(
  input: CreateLlmProviderInput,
): Promise<LlmProviderEntity> {
  const res = await apiClient
    .post("llm-providers", { json: input })
    .json<ApiResponse<LlmProviderEntity>>();
  return res.data;
}

/** 更新 Provider */
export async function updateProvider(
  id: string,
  input: UpdateLlmProviderInput,
): Promise<LlmProviderEntity> {
  const res = await apiClient
    .patch(`llm-providers/${id}`, { json: input })
    .json<ApiResponse<LlmProviderEntity>>();
  return res.data;
}

/** 删除自定义 Provider */
export async function deleteProvider(id: string): Promise<void> {
  await apiClient.delete(`llm-providers/${id}`);
}

/** 重置 Provider baseUrl 为默认值 */
export async function resetProviderBaseUrl(
  id: string,
): Promise<LlmProviderEntity> {
  const res = await apiClient
    .post(`llm-providers/${id}/reset-base-url`)
    .json<ApiResponse<LlmProviderEntity>>();
  return res.data;
}

/** 测试 Provider 连接 */
export async function testProviderConnection(
  id: string,
  timeoutMs?: number,
): Promise<ConnectionTestResult> {
  const res = await apiClient
    .post(`llm-providers/${id}/test-connection`, {
      json: timeoutMs != null ? { timeoutMs } : {},
    })
    .json<ApiResponse<ConnectionTestResult>>();
  return res.data;
}

/** 从 Provider 发现可用模型 */
export async function discoverProviderModels(
  id: string,
): Promise<DiscoveredModel[]> {
  const res = await apiClient
    .post(`llm-providers/${id}/discover-models`)
    .json<ApiResponse<DiscoveredModel[]>>();
  return res.data;
}

/** 搜索 Provider 对应的 LiteLLM 模型目录 */
export async function searchProviderLiteLLMModels(
  id: string,
): Promise<LiteLLMModelInfo[]> {
  const res = await apiClient
    .get(`llm-providers/${id}/litellm-models`)
    .json<ApiResponse<LiteLLMModelInfo[]>>();
  return res.data;
}

/** 查询单个模型的 LiteLLM 元数据 */
export async function lookupModelMetadata(
  providerSlug: string,
  modelId: string,
): Promise<LiteLLMModelInfo | null> {
  const res = await apiClient
    .get("llm-providers/metadata/lookup", {
      searchParams: { providerSlug, modelId },
    })
    .json<ApiResponse<LiteLLMModelInfo | null>>();
  return res.data;
}

/** 直接测试私有云端点连接 */
export async function testPrivateCloudConnection(
  input: TestConnectionInput,
): Promise<ConnectionTestResult> {
  const res = await apiClient
    .post("llm/test-connection", { json: input })
    .json<ApiResponse<ConnectionTestResult>>();
  return res.data;
}

/** 直接获取私有云端点可用模型 */
export async function fetchPrivateCloudModels(
  input: FetchModelsInput,
): Promise<PrivateCloudModelInfo[]> {
  const res = await apiClient
    .post("llm/private-cloud/models", { json: input })
    .json<ApiResponse<PrivateCloudModelInfo[]>>();
  return res.data;
}

// ============================================================================
// Model API
// ============================================================================

/** 获取所有模型配置 */
export async function fetchLlmModels(): Promise<LlmModelConfigEntity[]> {
  const res = await apiClient
    .get("llm-models")
    .json<ApiResponse<LlmModelConfigEntity[]>>();
  return res.data;
}

/** 获取单个模型配置 */
export async function fetchLlmModel(id: string): Promise<LlmModelConfigEntity> {
  const res = await apiClient
    .get(`llm-models/${id}`)
    .json<ApiResponse<LlmModelConfigEntity>>();
  return res.data;
}

/** 创建模型配置 */
export async function createLlmModel(
  input: CreateLlmModelInput,
): Promise<LlmModelConfigEntity> {
  const res = await apiClient
    .post("llm-models", { json: input })
    .json<ApiResponse<LlmModelConfigEntity>>();
  return res.data;
}

/** 更新模型配置 */
export async function updateLlmModel(
  id: string,
  input: UpdateLlmModelInput,
): Promise<LlmModelConfigEntity> {
  const res = await apiClient
    .patch(`llm-models/${id}`, { json: input })
    .json<ApiResponse<LlmModelConfigEntity>>();
  return res.data;
}

/** 删除模型配置 */
export async function deleteLlmModel(id: string): Promise<void> {
  await apiClient.delete(`llm-models/${id}`);
}

// ============================================================================
// API Keys (保持不变)
// ============================================================================

/** 获取 API Keys 列表 */
export async function fetchApiKeys(): Promise<ApiKeyInfo[]> {
  const res = await apiClient.get("api-keys").json<ApiResponse<ApiKeyInfo[]>>();
  return res.data;
}
