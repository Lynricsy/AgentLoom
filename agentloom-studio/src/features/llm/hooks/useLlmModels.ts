import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { llmModelKeys, llmProviderKeys } from '../api/llmModelKeys'
import {
  createLlmModel,
  createProvider,
  deleteLlmModel,
  deleteProvider,
  discoverProviderModels,
  fetchApiKeys,
  fetchLlmModel,
  fetchLlmModels,
  fetchProvider,
  fetchProviders,
  lookupModelMetadata,
  resetProviderBaseUrl,
  searchProviderLiteLLMModels,
  testProviderConnection,
  updateLlmModel,
  updateProvider,
} from '../api/llmModelApi'
import type {
  CreateLlmModelInput,
  CreateLlmProviderInput,
  UpdateLlmModelInput,
  UpdateLlmProviderInput,
} from '../types'
import { adaptModelEntityToInfo } from '../types'

// ============================================================================
// Provider hooks
// ============================================================================

/** 获取所有 Provider */
export function useLlmProviders() {
  return useQuery({
    queryKey: llmProviderKeys.lists(),
    queryFn: fetchProviders,
  })
}

/** 获取单个 Provider */
export function useLlmProvider(id: string | null) {
  return useQuery({
    queryKey: id ? llmProviderKeys.detail(id) : llmProviderKeys.details(),
    queryFn: async () => {
      if (!id) {
        throw new Error('Provider id is required')
      }

      return fetchProvider(id)
    },
    enabled: !!id,
  })
}

/** 创建自定义 Provider */
export function useCreateProvider() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...llmProviderKeys.all, 'create'] as const,
    mutationFn: (input: CreateLlmProviderInput) => createProvider(input),
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: llmProviderKeys.lists() })
    },
  })
}

/** 更新 Provider */
export function useUpdateProvider() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...llmProviderKeys.all, 'update'] as const,
    mutationFn: ({ id, input }: { id: string; input: UpdateLlmProviderInput }) =>
      updateProvider(id, input),
    gcTime: 0,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: llmProviderKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: llmProviderKeys.detail(variables.id) }),
      ])
    },
  })
}

/** 删除自定义 Provider */
export function useDeleteProvider() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...llmProviderKeys.all, 'delete'] as const,
    mutationFn: (id: string) => deleteProvider(id),
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: llmProviderKeys.lists() })
    },
  })
}

/** 重置 Provider baseUrl 为默认值 */
export function useResetProviderBaseUrl() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...llmProviderKeys.all, 'reset-base-url'] as const,
    mutationFn: (id: string) => resetProviderBaseUrl(id),
    gcTime: 0,
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: llmProviderKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: llmProviderKeys.detail(data.id) }),
      ])
    },
  })
}

/** 测试 Provider 连接 */
export function useTestProviderConnection() {
  return useMutation({
    mutationFn: ({ id, timeoutMs }: { id: string; timeoutMs?: number }) =>
      testProviderConnection(id, timeoutMs),
  })
}

/** 从 Provider 发现可用模型 */
export function useDiscoverModels() {
  return useMutation({
    mutationFn: (id: string) => discoverProviderModels(id),
  })
}

/** 搜索 Provider 对应的 LiteLLM 模型目录 */
export function useSearchLiteLLMModels(providerId: string | null) {
  return useQuery({
    queryKey: providerId ? llmProviderKeys.litellmModels(providerId) : llmProviderKeys.all,
    queryFn: async () => {
      if (!providerId) {
        throw new Error('Provider id is required')
      }

      return searchProviderLiteLLMModels(providerId)
    },
    enabled: !!providerId,
  })
}

/** 查询单个模型的 LiteLLM 元数据 */
export function useLookupModelMetadata() {
  return useMutation({
    mutationFn: ({ providerSlug, modelId }: { providerSlug: string; modelId: string }) =>
      lookupModelMetadata(providerSlug, modelId),
  })
}

// ============================================================================
// Model hooks
// ============================================================================

/**
 * 获取所有模型配置。
 * 返回数据带有 `provider`(slug) / `modelName` 兼容字段，
 * 以便旧代码无缝使用。
 */
export function useLlmModels() {
  return useQuery({
    queryKey: llmModelKeys.lists(),
    queryFn: fetchLlmModels,
    select: (entities) => entities.map(adaptModelEntityToInfo),
  })
}

/** 获取单个模型配置 */
export function useLlmModel(id: string | null) {
  return useQuery({
    queryKey: id ? llmModelKeys.detail(id) : llmModelKeys.details(),
    queryFn: async () => {
      if (!id) {
        throw new Error('LLM model id is required')
      }

      return fetchLlmModel(id)
    },
    enabled: !!id,
    select: adaptModelEntityToInfo,
  })
}

/** 获取 API Keys */
export function useLlmApiKeys() {
  return useQuery({
    queryKey: llmModelKeys.apiKeys(),
    queryFn: fetchApiKeys,
    select: (apiKeys) => apiKeys.filter((item) => item.status === 'active'),
  })
}

/** 创建模型配置 */
export function useCreateLlmModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...llmModelKeys.all, 'create'] as const,
    mutationFn: (payload: CreateLlmModelInput) => createLlmModel(payload),
    gcTime: 0,
    onSuccess: async (model) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: llmModelKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: llmModelKeys.detail(model.id) }),
      ])
    },
  })
}

/** 更新模型配置 */
export function useUpdateLlmModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...llmModelKeys.all, 'update'] as const,
    mutationFn: ({ id, payload }: { id: string; payload: UpdateLlmModelInput }) =>
      updateLlmModel(id, payload),
    gcTime: 0,
    onSuccess: async (model) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: llmModelKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: llmModelKeys.detail(model.id) }),
      ])
    },
  })
}

/** 删除模型配置 */
export function useDeleteLlmModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...llmModelKeys.all, 'delete'] as const,
    mutationFn: (id: string) => deleteLlmModel(id),
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: llmModelKeys.lists() })
    },
  })
}

// ============================================================================
// 旧版兼容 hooks (PrivateCloudConfigSection 等组件仍在使用)
// ============================================================================

/**
 * 测试私有云连接 (旧接口兼容)
 * @deprecated 新系统使用 useTestProviderConnection()
 */
export function useTestPrivateCloudConnection() {
  return useMutation({
    mutationFn: async (_input: import('../types').TestConnectionInput) => {
      // 旧版 PrivateCloudConfigSection 调用此 hook 时传入 TestConnectionInput，
      // 在新系统完全迁移前保持此 stub 可工作。
      // 实际逻辑：无真实后端端点，直接返回失败以提示迁移。
      return {
        success: false,
        latencyMs: 0,
        serverInfo: undefined,
      } as import('../types').ConnectionTestResult
    },
  })
}

/**
 * 获取私有云模型列表 (旧接口兼容)
 * @deprecated 新系统使用 useDiscoverModels()
 */
export function usePrivateCloudModels() {
  return useMutation({
    mutationFn: async (_input: import('../types').FetchModelsInput) => {
      return [] as import('../types').PrivateCloudModelInfo[]
    },
  })
}
