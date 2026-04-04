import type { MemoryInstanceListParams } from '../types';

export const memoryInstanceKeys = {
  all: ['memory-instances'] as const,
  lists: () => [...memoryInstanceKeys.all, 'list'] as const,
  allOptions: (sourceKind?: string) =>
    [...memoryInstanceKeys.lists(), 'all-options', sourceKind ?? 'all'] as const,
  list: (filters?: MemoryInstanceListParams) =>
    [...memoryInstanceKeys.lists(), filters] as const,
  details: () => [...memoryInstanceKeys.all, 'detail'] as const,
  detail: (id: string) => [...memoryInstanceKeys.details(), id] as const,
};
