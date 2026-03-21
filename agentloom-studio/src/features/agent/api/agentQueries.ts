import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ListAgentsParams } from './agentDefinitionApi'
import { getAgent, listAgents, listAgentVersions } from './agentDefinitionApi'
import { agentKeys, agentVersionKeys } from './agentKeys'

export function useAgentList(params: ListAgentsParams = {}) {
  return useQuery({
    queryKey: agentKeys.list(params as Record<string, unknown>),
    queryFn: () => listAgents(params),
    placeholderData: keepPreviousData,
  })
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => getAgent(id),
    enabled: !!id,
  })
}

export function useAgentVersions(
  agentId: string,
  filters: { page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: agentVersionKeys.list(agentId, filters),
    queryFn: () => listAgentVersions(agentId, filters),
    enabled: !!agentId,
    placeholderData: keepPreviousData,
  })
}
