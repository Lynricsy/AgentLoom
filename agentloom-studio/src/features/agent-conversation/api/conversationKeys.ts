export const conversationKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  list: (agentId: string, filters?: Record<string, unknown>) =>
    [...conversationKeys.lists(), agentId, filters] as const,
  details: () => [...conversationKeys.all, 'detail'] as const,
  detail: (id: string) => [...conversationKeys.details(), id] as const,
  sandboxStats: (id: string) =>
    [...conversationKeys.all, 'sandbox-stats', id] as const,
};
