import { apiClient } from '@/shared/api/client'
import type { PaginatedResponse } from '@/shared/types/api'
import type { RoutingDecision, RoutingDecisionQuery } from '../types'

export const ROUTING_DECISION_PAGE_SIZE = 20


/** GET /routing-decisions —— 服务端按 createdAt 倒序分页 */
export async function fetchRoutingDecisions(
  query: RoutingDecisionQuery = {},
): Promise<PaginatedResponse<RoutingDecision>> {
  const searchParams: Record<string, string | number> = {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? ROUTING_DECISION_PAGE_SIZE,
  }

  if (query.executionId) {
    searchParams.executionId = query.executionId
  }

  if (query.routingNodeId) {
    searchParams.routingNodeId = query.routingNodeId
  }

  return apiClient
    .get('routing-decisions', { searchParams })
    .json<PaginatedResponse<RoutingDecision>>()
}
