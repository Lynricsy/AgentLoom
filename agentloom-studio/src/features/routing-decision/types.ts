
/** 单次决策里被评估过的候选模型（服务端 jsonb 原样透传） */
export interface RoutingModelEvaluation {
  modelId: string
  modelName: string
  provider: string
  score: number
  reasoning: string
}

/** 策略失败走确定性回退的原因（与服务端 ROUTING_FALLBACK_REASONS 一致） */
export type RoutingFallbackReason =
  | 'llm_timeout'
  | 'llm_invalid_response'
  | 'llm_http_error'
  | 'llm_config_error'
  | 'router_error'

/** 回退后的模型来源 */
export type RoutingFallbackSource = 'configured_model' | 'rules' | 'first_candidate'

export interface RoutingDecision {
  id: string
  /** 决策主体二选一：工作流路由步骤或 Agent 对话 */
  executionStepId: string | null
  conversationId: string | null
  tenantId: string
  routingNodeId: string
  strategy: string
  routerType: string | null
  modelsEvaluated: RoutingModelEvaluation[]
  /** 服务端可为 null：候选模型全部不可用或策略放弃选择时 */
  selectedModelId: string | null
  decisionReasoning: string
  routingLatencyMs: number
  /** 仅在策略失败、走确定性回退时有值 */
  fallbackReason: RoutingFallbackReason | null
  fallbackSource: RoutingFallbackSource | null
  createdAt: string
}

export interface RoutingDecisionQuery {
  page?: number
  pageSize?: number
  executionId?: string
  routingNodeId?: string
}
