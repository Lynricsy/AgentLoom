import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchMemoryInstances,
  fetchMemoryInstanceDetail,
  fetchAllMemoryInstances,
  browseMemoryNode,
  fetchMemoryDomains,
  searchMemoryNodes,
  fetchNodeVersions,
} from './memoryInstanceApi'
import { memoryInstanceKeys } from './memoryInstanceKeys'
import type { MemoryInstanceListParams } from '../types'

export function useMemoryInstances(params?: MemoryInstanceListParams) {
  return useQuery({
    queryKey: memoryInstanceKeys.list(params),
    queryFn: () => fetchMemoryInstances(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

export function useMemoryInstanceDetail(
  id: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: memoryInstanceKeys.detail(id),
    queryFn: () => fetchMemoryInstanceDetail(id),
    enabled: options?.enabled ?? Boolean(id),
    staleTime: 30_000,
  })
}

export function useAllMemoryInstances() {
  return useQuery({
    queryKey: memoryInstanceKeys.lists(),
    queryFn: fetchAllMemoryInstances,
    staleTime: 30_000,
  })
}

// --- Browse hooks ---

export function useMemoryBrowse(
  instanceId: string,
  domain: string,
  path?: string,
) {
  return useQuery({
    queryKey: memoryInstanceKeys.browse(instanceId, domain, path),
    queryFn: () => browseMemoryNode(instanceId, { domain, path }),
    enabled: Boolean(instanceId) && Boolean(domain),
    staleTime: 15_000,
  })
}

export function useMemoryDomains(instanceId: string) {
  return useQuery({
    queryKey: memoryInstanceKeys.domains(instanceId),
    queryFn: () => fetchMemoryDomains(instanceId),
    enabled: Boolean(instanceId),
    staleTime: 60_000,
  })
}

export function useMemorySearch(
  instanceId: string,
  query: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: memoryInstanceKeys.search(instanceId, query),
    queryFn: () => searchMemoryNodes(instanceId, query),
    enabled: options?.enabled ?? (Boolean(instanceId) && query.length >= 2),
    staleTime: 10_000,
  })
}

export function useNodeVersions(
  instanceId: string,
  nodeId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: memoryInstanceKeys.versions(instanceId, nodeId),
    queryFn: () => fetchNodeVersions(instanceId, nodeId),
    enabled: options?.enabled ?? (Boolean(instanceId) && Boolean(nodeId)),
    staleTime: 15_000,
  })
}
