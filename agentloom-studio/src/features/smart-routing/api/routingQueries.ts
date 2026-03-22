import { useQuery } from '@tanstack/react-query'
import { fetchConfigSchema, fetchHealthStatus, fetchRoutingDecisions, fetchStrategies } from './routingApi'
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

export function useStrategies(enabled = true) {
  return useQuery({
    queryKey: routingKeys.strategies,
    queryFn: fetchStrategies,
    enabled,
    staleTime: 10 * 60 * 1000,
  })
}

export function useHealthStatus(enabled = true) {
  return useQuery({
    queryKey: routingKeys.health,
    queryFn: fetchHealthStatus,
    enabled,
    staleTime: 30 * 1000,
  })
}

export function useConfigSchema(strategyName: string, enabled = true) {
  return useQuery({
    queryKey: routingKeys.configSchema(strategyName),
    queryFn: () => fetchConfigSchema(strategyName),
    enabled: enabled && !!strategyName,
    staleTime: 10 * 60 * 1000,
  })
}
