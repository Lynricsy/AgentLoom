import type { ListBlocksParams } from './blockApi';

export const blockKeys = {
  all: ['blocks'] as const,
  lists: () => [...blockKeys.all, 'list'] as const,
  list: (filters?: ListBlocksParams) => [...blockKeys.lists(), filters] as const,
  details: () => [...blockKeys.all, 'detail'] as const,
  detail: (id: string) => [...blockKeys.details(), id] as const,
};
