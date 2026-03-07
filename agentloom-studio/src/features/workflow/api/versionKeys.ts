export const versionKeys = {
  all: (workflowId: string) => ['workflows', workflowId, 'versions'] as const,
  lists: (workflowId: string) => [...versionKeys.all(workflowId), 'list'] as const,
  list: (workflowId: string, filters: Record<string, unknown>) =>
    [...versionKeys.lists(workflowId), filters] as const,
  published: (workflowId: string) =>
    [...versionKeys.all(workflowId), 'published'] as const,
}
