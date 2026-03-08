export const knowledgeBaseKeys = {
  all: ['knowledge-bases'] as const,
  lists: () => [...knowledgeBaseKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...knowledgeBaseKeys.lists(), filters] as const,
  details: () => [...knowledgeBaseKeys.all, 'detail'] as const,
  detail: (id: string) => [...knowledgeBaseKeys.details(), id] as const,
  documents: (knowledgeBaseId: string) =>
    [...knowledgeBaseKeys.detail(knowledgeBaseId), 'documents'] as const,
  documentList: (
    knowledgeBaseId: string,
    filters?: Record<string, unknown>,
  ) =>
    [...knowledgeBaseKeys.documents(knowledgeBaseId), 'list', filters] as const,
};
