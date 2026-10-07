import { useQuery } from '@tanstack/react-query'
import { fetchRuntimePlugin, fetchRuntimePlugins } from './runtimePluginApi'
import { runtimePluginKeys } from './runtimePluginKeys'
import type { RuntimePluginListParams } from '../types'

const RUNTIME_PLUGIN_STALE_TIME = 5 * 60 * 1000

export function useRuntimePlugins(params?: RuntimePluginListParams) {
  return useQuery({
    queryKey: runtimePluginKeys.list(params),
    queryFn: () => fetchRuntimePlugins(params),
    staleTime: RUNTIME_PLUGIN_STALE_TIME,
  })
}

/** 画布 runtime-plugin 节点的可选列表：只列已启用的包 */
export function useActiveRuntimePlugins() {
  return useRuntimePlugins({ status: 'active', pageSize: 100 })
}

export function useRuntimePlugin(id: string) {
  return useQuery({
    queryKey: runtimePluginKeys.detail(id),
    queryFn: () => fetchRuntimePlugin(id),
    staleTime: RUNTIME_PLUGIN_STALE_TIME,
    enabled: !!id,
  })
}
