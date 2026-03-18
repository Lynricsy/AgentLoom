import type { AutonomyMode } from '@/features/canvas/autonomy.types'

export type SuggestionType =
  | 'model_downgrade'
  | 'timeout_adjustment'
  | 'tool_pruning'
  | 'autonomy_upgrade'

export type SuggestionStatus = 'pending' | 'applied' | 'dismissed' | 'blocked'

export interface ImpactEstimate {
  costSavingPct?: number
  latencyImpactPct?: number
  reliabilityImpactPct?: number
}

export interface OptimizationSuggestionPolicyBlock {
  autonomyCap: AutonomyMode
  rawMode: string
  canonicalMode: AutonomyMode
  replacementMode: AutonomyMode
  source: string
  reasonCode: string
  message: string
  blockedAt: string
}

export interface OptimizationSuggestionAnalysisMetadata {
  policyBlock?: OptimizationSuggestionPolicyBlock | null
  [key: string]: unknown
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
  analysisMetadata?: OptimizationSuggestionAnalysisMetadata | null
  analysisPeriodStart: string
  analysisPeriodEnd: string
  appliedAt?: string | null
  dismissedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface AdoptionStatsByType {
  suggestionType: SuggestionType
  total: number
  applied: number
  dismissed: number
  pending: number
  blocked: number
  adoptionRate: number
}

export interface AdoptionStats {
  total: number
  applied: number
  dismissed: number
  pending: number
  blocked: number
  adoptionRate: number
  targetRate: number
  byType: AdoptionStatsByType[]
}
