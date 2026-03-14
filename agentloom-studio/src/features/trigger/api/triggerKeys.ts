export const triggerKeys = {
  all: ['triggers'] as const,
  lists: () => [...triggerKeys.all, 'list'] as const,
  list: (workflowId: string, filters?: Record<string, unknown>) =>
    [...triggerKeys.lists(), workflowId, filters] as const,
  details: () => [...triggerKeys.all, 'detail'] as const,
  detail: (workflowId: string, triggerId: string) =>
    [...triggerKeys.details(), workflowId, triggerId] as const,
  histories: () => [...triggerKeys.all, 'history'] as const,
  history: (triggerId: string, filters?: Record<string, unknown>) =>
    [...triggerKeys.histories(), triggerId, filters] as const,
}
