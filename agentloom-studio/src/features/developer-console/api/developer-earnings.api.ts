import { apiClient } from '@/shared/api/client'
import type { PaginatedResponse } from '@/shared/types/api'

export interface EarningsSummary {
  totalRevenue: string
  currentMonthRevenue: string
  totalExecutions: number
  activePlugins: number
}

export interface MonthlyTrend {
  month: string
  revenue: string
  executions: number
}

export interface PluginUsageRank {
  pluginId: string
  pluginName: string
  executionCount: number
  revenue: string
  percentage: number
}

export interface SettlementRecord {
  id: string
  periodStart: string
  periodEnd: string
  pluginId: string
  pluginName: string
  totalExecutions: number
  totalRevenue: string
  developerShare: string
  platformShare: string
  listingCommission: string
  payoutStatus: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: string
}

export interface EarningsFilters {
  page?: number
  pageSize?: number
}

const PLUGIN_EARNINGS_PATH = 'plugins/marketplace/earnings'

export async function fetchEarningsSummary(): Promise<EarningsSummary> {
  return apiClient
    .get(`${PLUGIN_EARNINGS_PATH}/summary`)
    .json<EarningsSummary>()
}

export async function fetchMonthlyTrends(): Promise<MonthlyTrend[]> {
  return apiClient
    .get(`${PLUGIN_EARNINGS_PATH}/trends`)
    .json<MonthlyTrend[]>()
}

export async function fetchPluginUsageRanking(): Promise<PluginUsageRank[]> {
  return apiClient
    .get(`${PLUGIN_EARNINGS_PATH}/ranking`)
    .json<PluginUsageRank[]>()
}

export async function fetchSettlementHistory(
  filters: EarningsFilters,
): Promise<PaginatedResponse<SettlementRecord>> {
  const params: Record<string, string> = {}
  if (filters.page) params.page = String(filters.page)
  if (filters.pageSize) params.pageSize = String(filters.pageSize)
  return apiClient
    .get(`${PLUGIN_EARNINGS_PATH}/settlements`, { searchParams: params })
    .json<PaginatedResponse<SettlementRecord>>()
}
