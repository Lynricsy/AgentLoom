import type { MemoryInstanceListParams } from '../types'

export const memoryInstanceKeys = {
  all: ['memory-instances'] as const,
  lists: () => [...memoryInstanceKeys.all, 'list'] as const,
  list: (params?: MemoryInstanceListParams) => [...memoryInstanceKeys.lists(), params] as const,
  details: () => [...memoryInstanceKeys.all, 'detail'] as const,
  detail: (id: string) => [...memoryInstanceKeys.details(), id] as const,
  browse: (instanceId: string, domain: string, path?: string) =>
    [...memoryInstanceKeys.all, 'browse', instanceId, domain, path] as const,
  domains: (instanceId: string) =>
    [...memoryInstanceKeys.all, 'domains', instanceId] as const,
  search: (instanceId: string, query: string) =>
    [...memoryInstanceKeys.all, 'search', instanceId, query] as const,
  versions: (instanceId: string, nodeId: string) =>
    [...memoryInstanceKeys.all, 'versions', instanceId, nodeId] as const,
}
