export const routingKeys = {
  all: ['routing-decisions'] as const,
  list: (params: { executionId?: string; routingNodeId?: string; page?: number; pageSize?: number }) =>
    [...routingKeys.all, 'list', params] as const,
}
