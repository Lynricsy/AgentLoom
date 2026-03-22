export const routingKeys = {
  all: ['routing-decisions'] as const,
  list: (params: { executionId?: string; routingNodeId?: string; page?: number; pageSize?: number }) =>
    [...routingKeys.all, 'list', params] as const,

  strategies: ['smart-routing', 'strategies'] as const,
  health: ['smart-routing', 'health'] as const,
  configSchema: (strategyName: string) =>
    ['smart-routing', 'config-schema', strategyName] as const,
}
