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
  fetchSuggestions,
  SUGGESTION_PAGE_SIZE,
  type SuggestionListQuery,
  type SuggestionListResult,
} from './optimization-suggestion-api'
import type {
  OptimizationSuggestion,
  AdoptionStats,
} from '../types/optimization-suggestion.types'
import type { ApiResponse } from '@/shared/types/api'
import { workflowKeys } from '@/features/workflow/api/workflowKeys'

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

/** 租户级全局建议列表（画布面板走 useNodeSuggestions，二者互不影响） */
export function useSuggestionList(query: SuggestionListQuery = {}) {
  const limit = query.limit ?? SUGGESTION_PAGE_SIZE
  const offset = query.offset ?? 0

  return useQuery<SuggestionListResult, Error>({
    queryKey: optimizationSuggestionKeys.list({
      limit,
      offset,
      status: query.status,
    }),
    queryFn: () => fetchSuggestions({ ...query, limit, offset }),
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
    onSuccess: (response) => {
      void queryClient.invalidateQueries({
        queryKey: optimizationSuggestionKeys.all,
      })

      void queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(response.data.workflowDefinitionId),
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
