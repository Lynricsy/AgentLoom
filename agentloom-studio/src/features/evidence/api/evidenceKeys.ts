export const evidenceKeys = {
  all: ['evidence'] as const,
  lists: () => [...evidenceKeys.all, 'list'] as const,
  list: (executionId: string, filters?: Record<string, unknown>) =>
    [...evidenceKeys.lists(), executionId, filters] as const,
  allRecords: (executionId: string, filters?: Record<string, unknown>) =>
    [...evidenceKeys.all, 'all-records', executionId, filters] as const,
  details: () => [...evidenceKeys.all, 'detail'] as const,
  detail: (executionId: string, evidenceId: string) =>
    [...evidenceKeys.details(), executionId, evidenceId] as const,
  chains: () => [...evidenceKeys.all, 'chain'] as const,
  chain: (executionId: string, nodeId?: string) =>
    [...evidenceKeys.chains(), executionId, nodeId] as const,
  documentContent: (knowledgeBaseId: string, documentId: string) =>
    [...evidenceKeys.all, 'document-content', knowledgeBaseId, documentId] as const,
};
