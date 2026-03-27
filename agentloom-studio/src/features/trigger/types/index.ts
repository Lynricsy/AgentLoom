export type TriggerType = 'cron' | 'webhook' | 'api_event'

export type TriggerHistoryStatus = 'success' | 'failed' | 'skipped' | 'signature_failed'

export interface CronTriggerConfig {
  expression: string
  timezone: string
}

export type WebhookAuthMode = 'simple' | 'signed'

export interface WebhookTriggerConfig {
  token: string
  secret?: string
  ipWhitelist: string[]
  authMode?: WebhookAuthMode
}

export interface WebhookTriggerConfigInput {
  ipWhitelist: string[]
  authMode?: WebhookAuthMode
}

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

export interface CreateTriggerData {
  name: string
  type: TriggerType
  config: CronTriggerConfig | WebhookTriggerConfigInput | ApiEventTriggerConfig
  description?: string
  isEnabled?: boolean
}

export interface UpdateTriggerData {
  name?: string
  description?: string | null
  config?: CronTriggerConfig | WebhookTriggerConfigInput | ApiEventTriggerConfig
  isEnabled?: boolean
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
