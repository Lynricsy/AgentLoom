
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
