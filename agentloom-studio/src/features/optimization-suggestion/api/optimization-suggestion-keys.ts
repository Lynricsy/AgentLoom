export const optimizationSuggestionKeys = {
  all: ['optimization-suggestions'] as const,
  byNode: (workflowId: string, nodeId: string) =>
    [...optimizationSuggestionKeys.all, 'node', workflowId, nodeId] as const,
  list: (query: { limit: number; offset: number; status?: string }) =>
    [...optimizationSuggestionKeys.all, 'list', query] as const,
  stats: (workflowId?: string) =>
    [...optimizationSuggestionKeys.all, 'stats', workflowId] as const,
}
