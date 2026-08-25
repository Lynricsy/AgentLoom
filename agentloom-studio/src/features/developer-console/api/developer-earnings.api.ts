import {
  UpdatePayoutStatusDtoPayoutStatusEnum,
  type UpdatePayoutStatusDto,
} from '@agentloom/api-client'

import { apiClient } from '@/shared/api/client'
import type { PaginatedResponse } from '@/shared/types/api'

export interface EarningsSummary {
  totalRevenue: string
  currentMonthRevenue: string
  totalExecutions: number
  activePlugins: number
  /** 开发者分成合计 */
  totalDeveloperShare: string
  /** 待打款金额（payoutStatus = pending 的开发者分成） */
  pendingPayout: string
  /** 已打款金额（payoutStatus = completed 的开发者分成） */
  completedPayout: string
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

export type PayoutStatus = UpdatePayoutStatusDtoPayoutStatusEnum

export const PAYOUT_STATUS = UpdatePayoutStatusDtoPayoutStatusEnum

/**
 * 合法打款状态迁移。completed 是终态，failed 只能回到 processing。
 * 与服务端 `PluginEarningsService.updatePayoutStatus` 的 guard 一一对应，
 * 非法迁移服务端返回 409（problem+json，detail 里带原因）。
 */
export const PAYOUT_STATUS_TRANSITIONS: Record<
  PayoutStatus,
  readonly PayoutStatus[]
> = {
  pending: ['processing'],
  processing: ['completed', 'failed'],
  failed: ['processing'],
  completed: [],
}

/**
 * PATCH /plugins/marketplace/earnings/:id/payout-status 请求体（生成模型）。
 * 只有迁移到 processing/completed 才允许携带 payoutReference；
 * DTO 是 strict 的，**不存在** payoutAt（完成时间由服务端写入）。
 */
export type UpdatePayoutStatusRequest = UpdatePayoutStatusDto

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
  payoutStatus: PayoutStatus
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

export async function updatePayoutStatus(
  earningId: string,
  body: UpdatePayoutStatusRequest,
): Promise<SettlementRecord> {
  return apiClient
    .patch(`${PLUGIN_EARNINGS_PATH}/${earningId}/payout-status`, { json: body })
    .json<SettlementRecord>()
}
