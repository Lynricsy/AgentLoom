export const agentApiKeyKeys = {
  all: ['agent-api-keys'] as const,
  lists: () => [...agentApiKeyKeys.all, 'list'] as const,
  agentLists: (agentId: string) =>
    [...agentApiKeyKeys.lists(), agentId] as const,
  list: (agentId: string, filters?: Record<string, unknown>) =>
    [...agentApiKeyKeys.agentLists(agentId), filters] as const,
}
