import { useQuery } from '@tanstack/react-query'
import { fetchRoutingDecisions } from './routing-decision-api'
import { routingDecisionKeys } from './routing-decision-keys'
import type { RoutingDecisionQuery } from '../types'


export function useRoutingDecisions(query: RoutingDecisionQuery = {}) {
  return useQuery({
    queryKey: routingDecisionKeys.list(query),
    queryFn: () => fetchRoutingDecisions(query),
    staleTime: 15_000,
  })
}
