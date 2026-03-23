import type { ListSkillsParams } from './skillApi';

export const skillKeys = {
  all: ['skills'] as const,
  lists: () => [...skillKeys.all, 'list'] as const,
  list: (filters?: ListSkillsParams) =>
    [...skillKeys.lists(), filters ?? {}] as const,
  details: () => [...skillKeys.all, 'detail'] as const,
  detail: (id: string) => [...skillKeys.details(), id] as const,
  files: (id: string) => [...skillKeys.all, 'files', id] as const,
};
