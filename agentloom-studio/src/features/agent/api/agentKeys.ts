export const agentKeys = {
  all: ['agents'] as const,
  lists: () => [...agentKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...agentKeys.lists(), filters] as const,
  details: () => [...agentKeys.all, 'detail'] as const,
  detail: (id: string) => [...agentKeys.details(), id] as const,
}

export const agentVersionKeys = {
  all: (agentId: string) => ['agents', agentId, 'versions'] as const,
  lists: (agentId: string) => [...agentVersionKeys.all(agentId), 'list'] as const,
  list: (agentId: string, filters: Record<string, unknown>) =>
    [...agentVersionKeys.lists(agentId), filters] as const,
}
