import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { optimizationSuggestionKeys } from './optimization-suggestion-keys'
import {
  fetchNodeSuggestions,
  applySuggestion,
  dismissSuggestion,
  fetchAdoptionStats,
} from './optimization-suggestion-api'
import type {
  OptimizationSuggestion,
  AdoptionStats,
} from '../types/optimization-suggestion.types'
import type { ApiResponse } from '@/shared/types/api'

export function useNodeSuggestions(
  workflowId: string,
  nodeId: string,
  options?: Omit<
    UseQueryOptions<
      ApiResponse<OptimizationSuggestion[]>,
      Error,
      OptimizationSuggestion[]
    >,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: optimizationSuggestionKeys.byNode(workflowId, nodeId),
    queryFn: () => fetchNodeSuggestions(workflowId, nodeId),
    select: (response) => response.data,
    ...options,
  })
}

export function useAdoptionStats(
  workflowId?: string,
  options?: Omit<
    UseQueryOptions<ApiResponse<AdoptionStats>, Error, AdoptionStats>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: optimizationSuggestionKeys.stats(workflowId),
    queryFn: () => fetchAdoptionStats(workflowId),
    select: (response) => response.data,
    ...options,
  })
}

export function useApplySuggestion() {
  const queryClient = useQueryClient()

  return useMutation<ApiResponse<OptimizationSuggestion>, Error, string>({
    mutationKey: ['optimization-suggestions', 'apply'],
    mutationFn: (suggestionId) => applySuggestion(suggestionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: optimizationSuggestionKeys.all,
      })
    },
    gcTime: 0,
  })
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient()

  return useMutation<ApiResponse<OptimizationSuggestion>, Error, string>({
    mutationKey: ['optimization-suggestions', 'dismiss'],
    mutationFn: (suggestionId) => dismissSuggestion(suggestionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: optimizationSuggestionKeys.all,
      })
    },
    gcTime: 0,
  })
}
