export const evidenceKeys = {
  all: ['evidence'] as const,
  lists: () => [...evidenceKeys.all, 'list'] as const,
  list: (executionId: string, filters?: Record<string, unknown>) =>
    [...evidenceKeys.lists(), executionId, filters] as const,
  details: () => [...evidenceKeys.all, 'detail'] as const,
  detail: (executionId: string, evidenceId: string) =>
    [...evidenceKeys.details(), executionId, evidenceId] as const,
};
