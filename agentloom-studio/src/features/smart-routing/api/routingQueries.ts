import { useQuery } from '@tanstack/react-query'
import { fetchRoutingDecisions } from './routingApi'
import { routingKeys } from './routingKeys'

export function useRoutingDecisions(params: {
  executionId?: string
  routingNodeId?: string
  page?: number
  pageSize?: number
  enabled?: boolean
}) {
  const { enabled = true, ...queryParams } = params
  return useQuery({
    queryKey: routingKeys.list(queryParams),
    queryFn: () => fetchRoutingDecisions(queryParams),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}
