import { memo } from 'react'
import { Badge, type BadgeProps } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import type { CompatibilityLabel, ConfidenceLevel, MappingSuggestion } from '../../types'
import { getStrategyLabel } from '../../lib/coercionStrategies'

export interface MappingSuggestionCardProps {
  suggestion: MappingSuggestion
  onApply: (suggestion: MappingSuggestion) => void
}

const CONFIDENCE_VARIANT: Record<
  ConfidenceLevel,
  NonNullable<BadgeProps['variant']>
> = {
  high: 'success',
  medium: 'warning',
  low: 'secondary',
}

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const COMPAT_LABELS: Record<CompatibilityLabel, { text: string; className: string }> = {
  exact: { text: '完全兼容', className: 'suggestion-compat--exact' },
  coercible: { text: '可转换', className: 'suggestion-compat--coercible' },
  incompatible: { text: '不兼容', className: 'suggestion-compat--incompatible' },
}

export const MappingSuggestionCard = memo(function MappingSuggestionCard({
  suggestion,
  onApply,
}: MappingSuggestionCardProps) {
  const scorePercent = Math.round(suggestion.score * 100)
  const compat = COMPAT_LABELS[suggestion.compatibilityLabel]

  return (
    <Button
      variant="ghost"
      data-testid={`suggestion-card-${suggestion.targetField}`}
      className="h-auto w-full flex-col items-stretch gap-1.5 whitespace-normal rounded-lg border border-border bg-surface p-2 text-left font-normal hover:border-border-hover"
      onClick={() => onApply(suggestion)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 truncate font-mono text-2xs text-foreground">
          <span data-testid="suggestion-source">{suggestion.sourceField}</span>
          <span className="shrink-0 text-muted-foreground">→</span>
          <span data-testid="suggestion-target">{suggestion.targetField}</span>
        </span>
        <span
          data-testid="suggestion-score"
          className="shrink-0 text-2xs font-semibold tabular-nums text-primary"
        >
          {scorePercent}%
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          size="sm"
          variant={CONFIDENCE_VARIANT[suggestion.confidenceLevel]}
          data-testid="suggestion-confidence"
        >
          {CONFIDENCE_LABELS[suggestion.confidenceLevel]}
        </Badge>

        <span
          data-testid="suggestion-compat"
          className={`suggestion-compat ${compat.className}`}
        >
          {compat.text}
        </span>

        <span
          data-testid="suggestion-type-pair"
          className="inline-flex items-center whitespace-nowrap font-mono text-2xs text-muted-foreground"
        >
          {suggestion.sourceTypeLabel} → {suggestion.targetTypeLabel}
        </span>

        {suggestion.suggestedCoercion && (
          <span
            data-testid="suggestion-coercion"
            className="rounded-xs bg-warning/10 px-1.5 py-0.5 text-2xs font-medium text-warning"
          >
            {getStrategyLabel(suggestion.suggestedCoercion.strategy)}
          </span>
        )}
      </div>
    </Button>
  )
})
