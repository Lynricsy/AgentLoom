import type { FetchModelsInput, TestConnectionInput } from '../types'

export const llmModelKeys = {
  all: ['llm-models'] as const,
  lists: () => [...llmModelKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...llmModelKeys.lists(), filters] as const,
  details: () => [...llmModelKeys.all, 'detail'] as const,
  detail: (id: string) => [...llmModelKeys.details(), id] as const,
  providers: () => [...llmModelKeys.all, 'providers'] as const,
  apiKeys: () => [...llmModelKeys.all, 'api-keys'] as const,
  privateCloudConnection: (input: TestConnectionInput) => [...llmModelKeys.all, 'private-cloud-connection', input] as const,
  privateCloudModels: (input: FetchModelsInput) => [...llmModelKeys.all, 'private-cloud-models', input] as const,
}
