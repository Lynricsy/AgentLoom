// ============================================================================
// TanStack Query key factories
// ============================================================================

/** Model 相关 query keys */
export const llmModelKeys = {
  all: ['llm-models'] as const,
  lists: () => [...llmModelKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...llmModelKeys.lists(), filters] as const,
  details: () => [...llmModelKeys.all, 'detail'] as const,
  detail: (id: string) => [...llmModelKeys.details(), id] as const,
  apiKeys: () => [...llmModelKeys.all, 'api-keys'] as const,
}

/** Provider 相关 query keys */
export const llmProviderKeys = {
  all: ['llm-providers'] as const,
  lists: () => [...llmProviderKeys.all, 'list'] as const,
  details: () => [...llmProviderKeys.all, 'detail'] as const,
  detail: (id: string) => [...llmProviderKeys.details(), id] as const,
  litellmModels: (id: string) => [...llmProviderKeys.all, 'litellm-models', id] as const,
}
