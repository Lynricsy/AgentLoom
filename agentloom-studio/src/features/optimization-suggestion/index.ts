export type {
  SuggestionType,
  SuggestionStatus,
  OptimizationSuggestion,
  OptimizationSuggestionAnalysisMetadata,
  OptimizationSuggestionPolicyBlock,
  AdoptionStats,
  AdoptionStatsByType,
  ImpactEstimate,
} from './types/optimization-suggestion.types'

export {
  fetchNodeSuggestions,
  applySuggestion,
  dismissSuggestion,
  fetchAdoptionStats,
} from './api/optimization-suggestion-api'
export { optimizationSuggestionKeys } from './api/optimization-suggestion-keys'
export {
  useNodeSuggestions,
  useAdoptionStats,
  useApplySuggestion,
  useDismissSuggestion,
} from './api/optimization-suggestion-queries'

export { OptimizationSuggestionCard } from './components/OptimizationSuggestionCard'
export { OptimizationSuggestionsPanel } from './components/OptimizationSuggestionsPanel'
export { AdoptionStatsBadge } from './components/AdoptionStatsBadge'
