import { memo } from 'react'
import type { ConfidenceLevel, MappingSuggestion } from '../../types'
import { getStrategyLabel } from '../../lib/coercionStrategies'

export interface MappingSuggestionCardProps {
  suggestion: MappingSuggestion
  onApply: (suggestion: MappingSuggestion) => void
}

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  high: 'suggestion-badge--high',
  medium: 'suggestion-badge--medium',
  low: 'suggestion-badge--low',
}

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

export const MappingSuggestionCard = memo(function MappingSuggestionCard({
  suggestion,
  onApply,
}: MappingSuggestionCardProps) {
  const scorePercent = Math.round(suggestion.score * 100)

  return (
    <button
      type="button"
      data-testid={`suggestion-card-${suggestion.targetField}`}
      className="suggestion-card"
      onClick={() => onApply(suggestion)}
    >
      <div className="suggestion-card-header">
        <span className="suggestion-card-paths">
          <span data-testid="suggestion-source">{suggestion.sourceField}</span>
          <span className="suggestion-arrow">→</span>
          <span data-testid="suggestion-target">{suggestion.targetField}</span>
        </span>
        <span
          data-testid="suggestion-score"
          className="suggestion-score"
        >
          {scorePercent}%
        </span>
      </div>

      <div className="suggestion-card-meta">
        <span
          data-testid="suggestion-confidence"
          className={`suggestion-badge ${CONFIDENCE_COLORS[suggestion.confidenceLevel]}`}
        >
          {CONFIDENCE_LABELS[suggestion.confidenceLevel]}
        </span>

        {suggestion.suggestedCoercion && (
          <span data-testid="suggestion-coercion" className="suggestion-coercion">
            {getStrategyLabel(suggestion.suggestedCoercion.strategy)}
          </span>
        )}
      </div>
    </button>
  )
})
