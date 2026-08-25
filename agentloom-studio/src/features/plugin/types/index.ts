import type { UpdatePluginStatusDtoStatusEnum } from '@agentloom/api-client'

export type PluginStatus = UpdatePluginStatusDtoStatusEnum

export interface PluginNodeDefinition {
  type: string
  label: string
  category: string
  description: string
  inputPorts: Array<{
    id: string
    label: string
    dataType: string
    required?: boolean
    description?: string
  }>
  outputPorts: Array<{
    id: string
    label: string
    dataType: string
    required?: boolean
    description?: string
  }>
  configSchema?: Record<string, unknown>
}

export interface PluginRecord {
  id: string
  pluginId: string
  name: string
  version: string
  author: string
  description: string | null
  license: string | null
  status: PluginStatus
  manifest: Record<string, unknown>
  nodeDefinitions: PluginNodeDefinition[]
  permissions: string[]
  metadata: Record<string, unknown> | null
  /** 乐观并发版本号，状态变更时必须回传 */
  occVersion: number
  createdAt: string
  updatedAt: string
}

export interface PluginListItem {
  id: string
  pluginId: string
  name: string
  version: string
  author: string
  description: string | null
  license: string | null
  status: PluginStatus
  nodeDefinitions: PluginNodeDefinition[]
  metadata: Record<string, unknown> | null
  /** 乐观并发版本号，状态变更时必须回传 */
  occVersion: number
  createdAt: string
  updatedAt: string
}

/** 插件来源：由 metadata.clonedFromMarketplace 是否存在推导 */
export type PluginOrigin = 'marketplace' | 'upload'

/**
 * 插件用量流水（GET /plugins/:id/usage）。
 * 金额与耗时服务端以字符串下发（numeric 列，避免 JS 精度丢失）；
 * 免费插件的 billingAmount 为 null。
 */
export interface PluginUsageRecord {
  id: string
  pluginId: string
  executionId: string
  stepId: string
  billingAmount: string | null
  currency: string
  executionDurationMs: string | null
  sourceListingId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

/** 插件用量汇总（GET /plugins/:id/usage/summary） */
export interface PluginUsageSummary {
  totalExecutions: number
  totalBillingAmount: string | null
  avgDurationMs: number | null
  periodStart: string
  periodEnd: string
}

export interface PluginUsageFilters {
  page?: number
  pageSize?: number
  /** ISO 带偏移；服务端按闭区间过滤 createdAt */
  startDate?: string
  endDate?: string
  executionId?: string
  pluginId?: string
}

export interface PluginUsagePeriod {
  periodStart: string
  periodEnd: string
}
