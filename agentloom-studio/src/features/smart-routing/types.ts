import type {
  ProviderHealthStatusesResponseDtoDataInner,
  ProviderHealthStatusesResponseDtoDataInnerStatusEnum,
  SmartRoutingStrategiesResponseDtoDataInner,
  SmartRoutingStrategiesResponseDtoDataInnerCategoryEnum,
} from '@agentloom/api-client'

/**
 * STRATEGY_META 覆盖的策略名。
 *
 * 注意：这**不是** wire 类型 —— server 的 `SmartRoutingStrategySchema.name` 是
 * `z.string().min(1)`，插件可注册任意策略名。这里只用于给已知策略挂 UI 元数据，
 * 查表一律走 `getStrategyMeta()`（未知策略返回 undefined 并回落到原始名）。
 */
export type StrategyName =
  | 'random'
  | 'round_robin'
  | 'rules'
  | 'llm_as_router'
  | 'fallback_chain'
  | 'knn'
  | 'mlp'
  | 'elo'
  | 'memory_bank'
  | 'wasm_plugin'

/** 策略分类（生成模型枚举） */
export type StrategyCategory = SmartRoutingStrategiesResponseDtoDataInnerCategoryEnum

/**
 * 后端 GET /smart-routing/strategies 的单条返回。
 * 形状取自生成模型；`configSchema` 在生成产物里退化为无结构索引签名
 * （server 为 `z.object({}).catchall(z.unknown())`，不携带结构信息），
 * 这里换成下面的 `JsonSchema` 读取视图 —— 其字段全为可选，不会凭空断言必需性。
 */
export type StrategyInfo = Omit<SmartRoutingStrategiesResponseDtoDataInner, 'configSchema'> & {
  configSchema: JsonSchema
}

/** Provider 熔断状态枚举（生成模型枚举） */
export type ProviderHealthState =
  ProviderHealthStatusesResponseDtoDataInnerStatusEnum

/**
 * 后端 GET /smart-routing/health 的单条记录。
 * `modelId` 按 server `z.string().nullable()` 为可空：null 表示整个提供商维度熔断。
 */
export type ProviderHealthRecord = ProviderHealthStatusesResponseDtoDataInner

/** JSON Schema 读取视图（后端使用 Zod 4 z.toJSONSchema() 生成，字段均为可选） */
export interface JsonSchema {
  type?: string
  title?: string
  description?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  default?: unknown
}

export interface JsonSchemaProperty {
  type?: string
  title?: string
  description?: string
  default?: unknown
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  enum?: unknown[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}
