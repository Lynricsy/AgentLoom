import type { RuntimePluginListParams } from '../types'

export const runtimePluginKeys = {
  all: ['runtime-plugins'] as const,
  lists: () => [...runtimePluginKeys.all, 'list'] as const,
  list: (filters?: RuntimePluginListParams) =>
    [...runtimePluginKeys.lists(), filters] as const,
  details: () => [...runtimePluginKeys.all, 'detail'] as const,
  detail: (id: string) => [...runtimePluginKeys.details(), id] as const,
}
