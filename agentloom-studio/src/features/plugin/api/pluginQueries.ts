import { useQuery } from '@tanstack/react-query'
import { fetchPlugins, fetchPluginById } from './pluginApi'
import { fetchPluginUsage, fetchPluginUsageSummary } from './pluginUsageApi'
import { pluginKeys } from './pluginKeys'
import type {
  PluginStatus,
  PluginUsageFilters,
  PluginUsagePeriod,
} from '../types'

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

/** 用量流水刷新更勤：执行完就该看到新记录 */
const PLUGIN_USAGE_STALE_TIME = 30 * 1000

export function usePluginUsage(pluginDbId: string, filters: PluginUsageFilters) {
  return useQuery({
    queryKey: pluginKeys.usageList(pluginDbId, filters),
    queryFn: () => fetchPluginUsage(pluginDbId, filters),
    staleTime: PLUGIN_USAGE_STALE_TIME,
    enabled: !!pluginDbId,
  })
}

export function usePluginUsageSummary(
  pluginDbId: string,
  period: PluginUsagePeriod,
) {
  return useQuery({
    queryKey: pluginKeys.usageSummary(pluginDbId, period),
    queryFn: () => fetchPluginUsageSummary(pluginDbId, period),
    staleTime: PLUGIN_USAGE_STALE_TIME,
    enabled: !!pluginDbId,
  })
}
