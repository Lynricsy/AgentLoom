import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { llmModelKeys } from '../api/llmModelKeys'
import {
  createLlmModel,
  fetchApiKeys,
  fetchLlmModel,
  fetchLlmModels,
  fetchLlmProviders,
  fetchPrivateCloudModels,
  testPrivateCloudConnection,
  updateLlmModel,
} from '../api/llmModelApi'
import type { CreateLlmModelInput, UpdateLlmModelInput } from '../types'

export function useLlmModels() {
  return useQuery({
    queryKey: llmModelKeys.lists(),
    queryFn: fetchLlmModels,
  })
}

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
  })
}

export function useLlmProviders() {
  return useQuery({
    queryKey: llmModelKeys.providers(),
    queryFn: fetchLlmProviders,
  })
}

export function useLlmApiKeys() {
  return useQuery({
    queryKey: llmModelKeys.apiKeys(),
    queryFn: fetchApiKeys,
    select: (apiKeys) => apiKeys.filter((item) => item.status === 'active'),
  })
}

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

export function useTestPrivateCloudConnection() {
  return useMutation({
    mutationFn: testPrivateCloudConnection,
  })
}

export function usePrivateCloudModels() {
  return useMutation({
    mutationFn: fetchPrivateCloudModels,
  })
}
