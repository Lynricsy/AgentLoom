import type {
  CreateTriggerDto,
  CreateTriggerDtoConfigAnyOf,
  CreateTriggerDtoConfigAnyOf1,
  CreateTriggerDtoConfigAnyOf1AuthModeEnum,
  CreateTriggerDtoConfigAnyOf2,
  CreateTriggerDtoTypeEnum,
  UpdateTriggerDto,
} from '@agentloom/api-client'

export type TriggerType = CreateTriggerDtoTypeEnum

export type TriggerHistoryStatus = 'success' | 'failed' | 'skipped' | 'signature_failed'

export interface CronTriggerConfig {
  expression: string
  timezone: string
}

export type WebhookAuthMode = CreateTriggerDtoConfigAnyOf1AuthModeEnum

export interface WebhookTriggerConfig {
  token: string
  secret?: string
  ipWhitelist: string[]
  authMode?: WebhookAuthMode
}

/**
 * 提交侧的触发器配置（生成模型 anyOf 各分支）。
 *
 * 与响应侧刻意不同：server 输入 schema 对 `timezone`（default 'UTC'）、
 * `authMode`（default 'simple'）、`ipWhitelist`（default []）都允许省略，
 * 由 zod `.default()` 兜底；响应里这些字段一定有值。
 * 生成产物里合并后的 `CreateTriggerDtoConfig` 把三种 anyOf 摊平成了
 * 「同时要求 expression 和 eventSource」的非法形状，因此这里直接用各分支。
 */
export type CronTriggerConfigInput = CreateTriggerDtoConfigAnyOf

export type WebhookTriggerConfigInput = CreateTriggerDtoConfigAnyOf1

export type ApiEventTriggerConfigInput = CreateTriggerDtoConfigAnyOf2

export type TriggerConfigInput =
  | CronTriggerConfigInput
  | WebhookTriggerConfigInput
  | ApiEventTriggerConfigInput

export interface ApiEventTriggerConfig {
  eventSource: string
  eventType: string
  filterExpression?: string
}

export type TriggerConfig =
  | CronTriggerConfig
  | WebhookTriggerConfig
  | ApiEventTriggerConfig

export interface Trigger {
  id: string
  workflowDefinitionId: string
  tenantId: string
  name: string
  description: string | null
  type: TriggerType
  config: TriggerConfig
  isEnabled: boolean
  lastTriggeredAt: string | null
  nextFireAt: string | null
  triggerCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TriggerHistoryRecord {
  id: string
  triggerId: string
  tenantId: string
  status: TriggerHistoryStatus
  executionId: string | null
  errorMessage: string | null
  payload: Record<string, unknown> | null
  triggeredAt: string
}

export interface TriggerListMeta {
  total?: number
}

export interface TriggerListResult {
  data: Trigger[]
  meta?: TriggerListMeta
}

export interface TriggerHistoryMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface TriggerHistoryResult {
  data: TriggerHistoryRecord[]
  meta: TriggerHistoryMeta
}

export interface ListTriggersParams {
  type?: TriggerType
}

export interface TriggerHistoryParams {
  page?: number
  pageSize?: number
  status?: TriggerHistoryStatus
}

/** POST /workflow-definitions/:id/triggers 请求体（生成模型 + 可用的 config 联合） */
export type CreateTriggerData = Omit<CreateTriggerDto, 'config'> & {
  config: TriggerConfigInput
}

/** PATCH /triggers/:id 请求体（生成模型 + 可用的 config 联合） */
export type UpdateTriggerData = Omit<UpdateTriggerDto, 'config'> & {
  config?: TriggerConfigInput
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isCronConfig(config: TriggerConfig): config is CronTriggerConfig {
  return (
    isRecord(config) &&
    typeof config.expression === 'string' &&
    typeof config.timezone === 'string'
  )
}

export function isWebhookConfig(config: TriggerConfig): config is WebhookTriggerConfig {
  return (
    isRecord(config) &&
    typeof config.token === 'string' &&
    (config.secret === undefined || typeof config.secret === 'string') &&
    Array.isArray(config.ipWhitelist)
  )
}

export function hasWebhookSecret(
  config: TriggerConfig,
): config is WebhookTriggerConfig & { secret: string } {
  return isWebhookConfig(config) && typeof config.secret === 'string'
}

export function isApiEventConfig(config: TriggerConfig): config is ApiEventTriggerConfig {
  return (
    isRecord(config) &&
    typeof config.eventSource === 'string' &&
    typeof config.eventType === 'string'
  )
}
