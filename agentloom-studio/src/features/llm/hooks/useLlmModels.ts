import { useQuery } from '@tanstack/react-query'
import { llmModelKeys } from '../api/llmModelKeys'
import { fetchLlmModels, fetchLlmModel, fetchLlmProviders } from '../api/llmModelApi'

export function useLlmModels() {
  return useQuery({
    queryKey: llmModelKeys.lists(),
    queryFn: fetchLlmModels,
  })
}

export function useLlmModel(id: string | null) {
  return useQuery({
    queryKey: llmModelKeys.detail(id!),
    queryFn: () => fetchLlmModel(id!),
    enabled: !!id,
  })
}

export function useLlmProviders() {
  return useQuery({
    queryKey: llmModelKeys.providers(),
    queryFn: fetchLlmProviders,
  })
}
