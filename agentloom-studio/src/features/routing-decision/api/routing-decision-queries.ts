import { useQuery } from '@tanstack/react-query'
import {
  fetchProviderHealth,
  fetchRoutingDecisions,
} from './routing-decision-api'
import { routingDecisionKeys } from './routing-decision-keys'
import type { RoutingDecisionQuery } from '../types'

export function useProviderHealth() {
  return useQuery({
    queryKey: routingDecisionKeys.health(),
    queryFn: fetchProviderHealth,
    // 熔断状态变化快，短缓存即可
    staleTime: 15_000,
  })
}

export function useRoutingDecisions(query: RoutingDecisionQuery = {}) {
  return useQuery({
    queryKey: routingDecisionKeys.list(query),
    queryFn: () => fetchRoutingDecisions(query),
    staleTime: 15_000,
  })
}
