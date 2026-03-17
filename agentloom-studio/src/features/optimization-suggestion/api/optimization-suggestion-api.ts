import type { ApiResponse } from '@/shared/types/api'
import { apiClient } from '@/shared/api/client'
import type {
  OptimizationSuggestion,
  AdoptionStats,
} from '../types/optimization-suggestion.types'

/** GET /optimization-suggestions?workflowDefinitionId=...&nodeId=... */
export async function fetchNodeSuggestions(
  workflowDefinitionId: string,
  nodeId: string,
): Promise<ApiResponse<OptimizationSuggestion[]>> {
  return apiClient
    .get('optimization-suggestions', {
      searchParams: {
        workflowDefinitionId,
        nodeId,
      },
    })
    .json<ApiResponse<OptimizationSuggestion[]>>()
}

/** POST /optimization-suggestions/:id/apply */
export async function applySuggestion(
  suggestionId: string,
): Promise<ApiResponse<OptimizationSuggestion>> {
  return apiClient
    .post(`optimization-suggestions/${suggestionId}/apply`)
    .json<ApiResponse<OptimizationSuggestion>>()
}

/** POST /optimization-suggestions/:id/dismiss */
export async function dismissSuggestion(
  suggestionId: string,
): Promise<ApiResponse<OptimizationSuggestion>> {
  return apiClient
    .post(`optimization-suggestions/${suggestionId}/dismiss`)
    .json<ApiResponse<OptimizationSuggestion>>()
}

/** GET /optimization-suggestions/stats?workflowDefinitionId=... */
export async function fetchAdoptionStats(
  workflowDefinitionId?: string,
): Promise<ApiResponse<AdoptionStats>> {
  return apiClient
    .get('optimization-suggestions/stats', {
      searchParams: workflowDefinitionId
        ? { workflowDefinitionId }
        : undefined,
    })
    .json<ApiResponse<AdoptionStats>>()
}
