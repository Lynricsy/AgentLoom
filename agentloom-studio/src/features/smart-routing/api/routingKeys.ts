export const routingKeys = {
  all: ['routing-decisions'] as const,
  list: (params: { executionId?: string; routingNodeId?: string }) =>
    [...routingKeys.all, 'list', params] as const,
}
