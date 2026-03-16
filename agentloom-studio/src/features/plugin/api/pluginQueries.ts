import { useQuery } from '@tanstack/react-query'
import { fetchPlugins, fetchPluginById } from './pluginApi'
import { pluginKeys } from './pluginKeys'
import type { PluginStatus } from '../types'

const PLUGIN_STALE_TIME = 5 * 60 * 1000

export function usePlugins(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: PluginStatus
}) {
  return useQuery({
    queryKey: pluginKeys.list(params),
    queryFn: () => fetchPlugins(params),
    staleTime: PLUGIN_STALE_TIME,
  })
}

export function useActivePlugins() {
  return usePlugins({ status: 'active', pageSize: 100 })
}

export function usePluginById(id: string) {
  return useQuery({
    queryKey: pluginKeys.detail(id),
    queryFn: () => fetchPluginById(id),
    staleTime: PLUGIN_STALE_TIME,
    enabled: !!id,
  })
}
