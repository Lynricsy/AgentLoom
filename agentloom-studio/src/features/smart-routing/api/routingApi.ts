import type {
  ProviderHealthStatusesResponseDto,
  SmartRoutingStrategiesResponseDto,
  SmartRoutingStrategyConfigSchemaResponseDto,
} from '@agentloom/api-client'
import { apiClient } from '@/shared/api/client'
import type { JsonSchema, ProviderHealthRecord, StrategyInfo } from '../types'

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
  const res = await apiClient
    .get('smart-routing/strategies')
    .json<SmartRoutingStrategiesResponseDto>()
  return res.data
}

export async function fetchProviderHealth(): Promise<ProviderHealthRecord[]> {
  const res = await apiClient
    .get('smart-routing/health')
    .json<ProviderHealthStatusesResponseDto>()
  return res.data
}

export async function fetchConfigSchema(strategyName: string): Promise<JsonSchema> {
  const res = await apiClient
    .get(`smart-routing/strategies/${strategyName}/config-schema`)
    .json<SmartRoutingStrategyConfigSchemaResponseDto>()
  return res.data.configSchema
}
