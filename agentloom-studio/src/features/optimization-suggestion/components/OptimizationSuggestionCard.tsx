import { memo, useCallback } from 'react'
import { cn } from '@/shared/lib/utils'
import type {
  OptimizationSuggestion,
  SuggestionType,
} from '../types/optimization-suggestion.types'

const SUGGESTION_TYPE_CONFIG: Record<
  SuggestionType,
  { label: string; icon: string }
> = {
  model_downgrade: { label: '模型降级', icon: '⬇' },
  timeout_adjustment: { label: '超时调整', icon: '⏱' },
  tool_pruning: { label: '工具精简', icon: '✂' },
  autonomy_upgrade: { label: '自主升级', icon: '⬆' },
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

function renderCurrentVsSuggested(
  suggestionType: SuggestionType,
  currentValue: Record<string, unknown>,
  suggestedValue: Record<string, unknown>,
) {
  const currentAutonomyMode = currentValue.autonomyMode ?? currentValue.mode
  const suggestedAutonomyMode = suggestedValue.autonomyMode ?? suggestedValue.mode

  switch (suggestionType) {
    case 'model_downgrade':
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-400">{String(currentValue.model ?? currentValue.modelId ?? '—')}</span>
          <span className="text-zinc-500">→</span>
          <span className="text-emerald-400">{String(suggestedValue.model ?? suggestedValue.modelId ?? '—')}</span>
        </div>
      )
    case 'timeout_adjustment':
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-400">{String(currentValue.timeoutMs ?? '—')}ms</span>
          <span className="text-zinc-500">→</span>
          <span className="text-emerald-400">{String(suggestedValue.timeoutMs ?? '—')}ms</span>
        </div>
      )
    case 'tool_pruning': {
      const removedTools = Array.isArray(suggestedValue.removedTools)
        ? suggestedValue.removedTools
        : []
      return (
        <div className="text-sm">
          <span className="text-zinc-400">移除工具: </span>
          <span className="text-amber-400">
            {removedTools.length > 0 ? removedTools.join(', ') : '—'}
          </span>
        </div>
      )
    }
    case 'autonomy_upgrade':
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-400">{String(currentAutonomyMode ?? '—')}</span>
          <span className="text-zinc-500">→</span>
          <span className="text-emerald-400">{String(suggestedAutonomyMode ?? '—')}</span>
        </div>
      )
  }
}

interface OptimizationSuggestionCardProps {
  suggestion: OptimizationSuggestion
  onApply: (id: string) => void
  onDismiss: (id: string) => void
  actionsDisabled?: boolean
}

export const OptimizationSuggestionCard = memo(
  function OptimizationSuggestionCard({
    suggestion,
    onApply,
    onDismiss,
    actionsDisabled = false,
  }: OptimizationSuggestionCardProps) {
    const typeConfig = SUGGESTION_TYPE_CONFIG[suggestion.suggestionType]
    const isPending = suggestion.status === 'pending'

    const handleApply = useCallback(() => {
      onApply(suggestion.id)
    }, [onApply, suggestion.id])

    const handleDismiss = useCallback(() => {
      onDismiss(suggestion.id)
    }, [onDismiss, suggestion.id])

    return (
      <div
        className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-2"
        data-testid="optimization-suggestion-card"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">{typeConfig.icon}</span>
            <span className="text-sm font-medium text-zinc-100">
              {typeConfig.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isPending && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  suggestion.status === 'applied'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-zinc-500/15 text-zinc-400',
                )}
              >
                {suggestion.status === 'applied' ? '已采纳' : '已忽略'}
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                suggestion.confidence >= 0.8
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : suggestion.confidence >= 0.6
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-red-500/15 text-red-400',
              )}
            >
              {formatConfidence(suggestion.confidence)}
            </span>
          </div>
        </div>

        <div className="rounded-md bg-zinc-900/50 px-2.5 py-2">
          {renderCurrentVsSuggested(
            suggestion.suggestionType,
            suggestion.currentValue,
            suggestion.suggestedValue,
          )}
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          {suggestion.rationale}
        </p>

        {suggestion.impactEstimate && (
          <div className="flex flex-wrap gap-3 text-xs">
            {suggestion.impactEstimate.costSavingPct != null && (
              <span className="text-emerald-400">
                成本 -{suggestion.impactEstimate.costSavingPct}%
              </span>
            )}
            {suggestion.impactEstimate.latencyImpactPct != null && (
              <span
                className={
                  suggestion.impactEstimate.latencyImpactPct > 0
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }
              >
                延迟{' '}
                {suggestion.impactEstimate.latencyImpactPct > 0 ? '+' : ''}
                {suggestion.impactEstimate.latencyImpactPct}%
              </span>
            )}
            {suggestion.impactEstimate.reliabilityImpactPct != null && (
              <span
                className={
                  suggestion.impactEstimate.reliabilityImpactPct < 0
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }
              >
                可靠性{' '}
                {suggestion.impactEstimate.reliabilityImpactPct > 0 ? '+' : ''}
                {suggestion.impactEstimate.reliabilityImpactPct}%
              </span>
            )}
          </div>
        )}

        {isPending && (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleApply}
              disabled={actionsDisabled}
            >
              采纳
            </button>
            <button
              type="button"
              className="rounded-md bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleDismiss}
              disabled={actionsDisabled}
            >
              忽略
            </button>
          </div>
        )}
      </div>
    )
  },
)
