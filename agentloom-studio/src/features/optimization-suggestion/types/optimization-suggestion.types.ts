export type SuggestionType =
  | 'model_downgrade'
  | 'timeout_adjustment'
  | 'tool_pruning'
  | 'autonomy_upgrade'

export type SuggestionStatus = 'pending' | 'applied' | 'dismissed'

export interface ImpactEstimate {
  costSavingPct?: number
  latencyImpactPct?: number
  reliabilityImpactPct?: number
}

export interface OptimizationSuggestion {
  id: string
  tenantId: string
  workflowDefinitionId: string
  nodeId: string
  suggestionType: SuggestionType
  status: SuggestionStatus
  confidence: number
  currentValue: Record<string, unknown>
  suggestedValue: Record<string, unknown>
  rationale: string
  impactEstimate?: ImpactEstimate | null
  analysisMetadata?: Record<string, unknown> | null
  analysisPeriodStart: string
  analysisPeriodEnd: string
  appliedAt?: string | null
  dismissedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface AdoptionStatsByType {
  suggestionType: SuggestionType
  applied: number
  dismissed: number
  pending: number
  adoptionRate: number
}

export interface AdoptionStats {
  total: number
  applied: number
  dismissed: number
  pending: number
  adoptionRate: number
  targetRate: number
  byType: AdoptionStatsByType[]
}
