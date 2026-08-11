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
  fetchSuggestions,
  applySuggestion,
  dismissSuggestion,
  fetchAdoptionStats,
  SUGGESTION_PAGE_SIZE,
} from './api/optimization-suggestion-api'
export type {
  SuggestionListQuery,
  SuggestionListMeta,
  SuggestionListResult,
} from './api/optimization-suggestion-api'
export { optimizationSuggestionKeys } from './api/optimization-suggestion-keys'
export {
  useNodeSuggestions,
  useSuggestionList,
  useAdoptionStats,
  useApplySuggestion,
  useDismissSuggestion,
} from './api/optimization-suggestion-queries'
export {
  SUGGESTION_STATUS_FILTERS,
  SUGGESTION_STATUS_META,
  SUGGESTION_TYPE_LABELS,
  formatSuggestionTimestamp,
} from './lib/suggestionPresentation'

export { OptimizationSuggestionCard } from './components/OptimizationSuggestionCard'
export { OptimizationSuggestionsPanel } from './components/OptimizationSuggestionsPanel'
export { OptimizationSuggestionsBoard } from './components/OptimizationSuggestionsBoard'
export { AdoptionStatsBadge } from './components/AdoptionStatsBadge'
