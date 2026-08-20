import type { ListWorkflowsParams } from '../types'

export const workflowKeys = {
  all: ['workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (filters: ListWorkflowsParams) => [...workflowKeys.lists(), filters] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
  inputSchemas: () => [...workflowKeys.all, 'input-schema'] as const,
  inputSchema: (id: string) => [...workflowKeys.inputSchemas(), id] as const,
}
