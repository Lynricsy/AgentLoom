import type { MemoryInstanceListParams } from '../types'

export const memoryInstanceKeys = {
  all: ['memory-instances'] as const,
  lists: () => [...memoryInstanceKeys.all, 'list'] as const,
  list: (params?: MemoryInstanceListParams) => [...memoryInstanceKeys.lists(), params] as const,
  details: () => [...memoryInstanceKeys.all, 'detail'] as const,
  detail: (id: string) => [...memoryInstanceKeys.details(), id] as const,
}
