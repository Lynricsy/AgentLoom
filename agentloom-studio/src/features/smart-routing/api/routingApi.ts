import { apiClient } from '@/shared/api/client'
import type { JsonSchema, ProviderHealth, StrategyInfo } from '../types'

export interface RoutingDecisionRecord {
  id: string
  executionStepId: string
  routingNodeId: string
  strategy: string
  modelsEvaluated: Array<{
    modelId: string
    modelName: string
    provider: string
    score: number
    reasoning: string
  }>
  selectedModelId: string | null
  decisionReasoning: string
  routingLatencyMs: number
  createdAt: string
}

export interface RoutingDecisionsResponse {
  data: RoutingDecisionRecord[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

export async function fetchRoutingDecisions(params: {
  executionId?: string
  routingNodeId?: string
  page?: number
  pageSize?: number
}): Promise<RoutingDecisionsResponse> {
  return apiClient.get('routing-decisions', { searchParams: params as Record<string, string | number> }).json()
}

export async function fetchStrategies(): Promise<StrategyInfo[]> {
  return apiClient.get('smart-routing/strategies').json()
}

export async function fetchHealthStatus(): Promise<ProviderHealth[]> {
  return apiClient.get('smart-routing/health').json()
}

export async function fetchConfigSchema(strategyName: string): Promise<JsonSchema> {
  return apiClient.get(`smart-routing/strategies/${strategyName}/config-schema`).json()
}
