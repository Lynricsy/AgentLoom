import type { ApiResponse } from '@/shared/types/api'
import { apiClient } from '@/shared/api/client'
import type {
  OptimizationSuggestion,
  AdoptionStats,
  SuggestionStatus,
  SuggestionType,
} from '../types/optimization-suggestion.types'

/** 全局建议列表默认页长 */
export const SUGGESTION_PAGE_SIZE = 20

export interface SuggestionListQuery {
  limit?: number
  offset?: number
  status?: SuggestionStatus
  suggestionType?: SuggestionType
}

export interface SuggestionListMeta {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface SuggestionListResult {
  data: OptimizationSuggestion[]
  meta: SuggestionListMeta
}

/**
 * GET /optimization-suggestions —— 租户级全局列表。
 * 服务端在「工作流 + 节点」分支下直接回数组，租户分支回 `{ data, meta }`，这里统一成后者。
 */
export async function fetchSuggestions(
  query: SuggestionListQuery = {},
): Promise<SuggestionListResult> {
  const limit = query.limit ?? SUGGESTION_PAGE_SIZE
  const offset = query.offset ?? 0
  const searchParams: Record<string, string | number> = { limit, offset }

  if (query.status) {
    searchParams.status = query.status
  }

  if (query.suggestionType) {
    searchParams.suggestionType = query.suggestionType
  }

  const response = await apiClient
    .get('optimization-suggestions', { searchParams })
    .json<ApiResponse<SuggestionListResult | OptimizationSuggestion[]>>()

  if (Array.isArray(response.data)) {
    return {
      data: response.data,
      meta: {
        total: response.data.length,
        limit,
        offset,
        hasMore: false,
      },
    }
  }

  return response.data
}

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
