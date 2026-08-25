import { apiClient } from '@/shared/api/client'
import type { PaginatedResponse } from '@/shared/types/api'
import type {
  PluginUsageFilters,
  PluginUsagePeriod,
  PluginUsageRecord,
  PluginUsageSummary,
} from '../types'

export async function fetchPluginUsage(
  pluginDbId: string,
  filters: PluginUsageFilters = {},
): Promise<PaginatedResponse<PluginUsageRecord>> {
  const searchParams: Record<string, string> = {}

  if (filters.page != null) searchParams.page = String(filters.page)
  if (filters.pageSize != null) searchParams.pageSize = String(filters.pageSize)
  if (filters.startDate) searchParams.startDate = filters.startDate
  if (filters.endDate) searchParams.endDate = filters.endDate
  if (filters.executionId) searchParams.executionId = filters.executionId
  if (filters.pluginId) searchParams.pluginId = filters.pluginId

  return apiClient
    .get(`plugins/${pluginDbId}/usage`, { searchParams })
    .json<PaginatedResponse<PluginUsageRecord>>()
}

export async function fetchPluginUsageSummary(
  pluginDbId: string,
  period: Partial<PluginUsagePeriod> = {},
): Promise<{ data: PluginUsageSummary }> {
  const searchParams: Record<string, string> = {}

  if (period.periodStart) searchParams.periodStart = period.periodStart
  if (period.periodEnd) searchParams.periodEnd = period.periodEnd

  return apiClient
    .get(`plugins/${pluginDbId}/usage/summary`, { searchParams })
    .json<{ data: PluginUsageSummary }>()
}
