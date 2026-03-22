import type { MemoryInstanceListParams } from '../types';

export const memoryInstanceKeys = {
  all: ['memory-instances'] as const,
  lists: () => [...memoryInstanceKeys.all, 'list'] as const,
  allOptions: () => [...memoryInstanceKeys.lists(), 'all-options'] as const,
  list: (filters?: MemoryInstanceListParams) =>
    [...memoryInstanceKeys.lists(), filters] as const,
  details: () => [...memoryInstanceKeys.all, 'detail'] as const,
  detail: (id: string) => [...memoryInstanceKeys.details(), id] as const,
};
