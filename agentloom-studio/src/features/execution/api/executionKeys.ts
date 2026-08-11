export interface ExecutionListFilters {
  workflowDefinitionId: string
  page?: number
  pageSize?: number
  status?: string
}

export const executionKeys = {
  all: ['executions'] as const,
  lists: () => [...executionKeys.all, 'list'] as const,
  list: (filters: ExecutionListFilters) =>
    [...executionKeys.lists(), filters] as const,
  details: () => [...executionKeys.all, 'detail'] as const,
  detail: (id: string) => [...executionKeys.details(), id] as const,
  records: (query: { executionId: string; limit: number; offset: number }) =>
    [...executionKeys.all, 'records', query] as const,
}
