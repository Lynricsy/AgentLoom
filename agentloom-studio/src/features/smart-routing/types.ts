/** 10 种路由策略名称（snake_case，与后端 RouterRegistry 对齐） */
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

/** 策略分类 */
export type StrategyCategory = 'simple' | 'ml' | 'rag' | 'plugin'

/** 后端 GET /smart-routing/strategies 的单条返回 */
export interface StrategyInfo {
  name: StrategyName
  category: StrategyCategory
  requiresEmbedding: boolean
  configSchema: JsonSchema
}

/** Provider 健康状态 */
export type ProviderHealthStatus = 'healthy' | 'degraded' | 'open'

/** 后端 GET /smart-routing/health 的单条返回 */
export interface ProviderHealth {
  providerName: string
  modelId: string
  status: ProviderHealthStatus
  failureCount: number
  lastFailureAt: string | null
}

/** JSON Schema 子集（后端使用 Zod 4 z.toJSONSchema() 生成） */
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
