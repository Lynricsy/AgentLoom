/** TanStack Query 键工厂 */
export const llmModelKeys = {
  all: ['llm-models'] as const,
  lists: () => [...llmModelKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...llmModelKeys.lists(), filters] as const,
  details: () => [...llmModelKeys.all, 'detail'] as const,
  detail: (id: string) => [...llmModelKeys.details(), id] as const,
  providers: () => [...llmModelKeys.all, 'providers'] as const,
}
