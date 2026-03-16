export const pluginKeys = {
  all: ['plugins'] as const,
  lists: () => [...pluginKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...pluginKeys.lists(), filters] as const,
  details: () => [...pluginKeys.all, 'detail'] as const,
  detail: (id: string) => [...pluginKeys.details(), id] as const,
}
