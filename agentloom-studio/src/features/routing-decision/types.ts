/** Smart Routing 提供商熔断状态，与服务端 PROVIDER_HEALTH_STATUS_STATES 一致 */
export type ProviderHealthState = 'healthy' | 'degraded' | 'open'

export interface ProviderHealthStatus {
  providerName: string
  /** 按模型维度熔断时才有值；为 null 表示整个提供商维度 */
  modelId: string | null
  status: ProviderHealthState
  failureCount: number
  lastFailureAt: string | null
}

/** 单次决策里被评估过的候选模型（服务端 jsonb 原样透传） */
export interface RoutingModelEvaluation {
  modelId: string
  modelName: string
  provider: string
  score: number
  reasoning: string
}

export interface RoutingDecision {
  id: string
  executionStepId: string
  tenantId: string
  routingNodeId: string
  strategy: string
  routerType: string | null
  modelsEvaluated: RoutingModelEvaluation[]
  /** 服务端可为 null：候选模型全部不可用或策略放弃选择时 */
  selectedModelId: string | null
  decisionReasoning: string
  routingLatencyMs: number
  createdAt: string
}

export interface RoutingDecisionQuery {
  page?: number
  pageSize?: number
  executionId?: string
  routingNodeId?: string
}
