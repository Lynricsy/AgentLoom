import type { ListTemplatesParams } from './templateApi';

export const templateKeys = {
  all: ['templates'] as const,
  lists: () => [...templateKeys.all, 'list'] as const,
  list: (filters?: ListTemplatesParams) =>
    [...templateKeys.lists(), filters] as const,
  details: () => [...templateKeys.all, 'detail'] as const,
  detail: (slug: string) => [...templateKeys.details(), slug] as const,
};
