import { memo, useCallback } from 'react'
import { formatAutonomyModeValue } from '@/features/organization-autonomy-policy'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { SUGGESTION_TYPE_LABELS } from '../lib/suggestionPresentation'
import type {
  OptimizationSuggestion,
  SuggestionStatus,
  SuggestionType,
} from '../types/optimization-suggestion.types'

const SUGGESTION_STATUS_CONFIG: Record<
  Exclude<SuggestionStatus, 'pending'>,
  { label: string; className: string }
> = {
  applied: {
    label: '已采纳',
    className: 'bg-emerald-500/15 text-emerald-400',
  },
  dismissed: {
    label: '已忽略',
    className: 'bg-zinc-500/15 text-zinc-400',
  },
  blocked: {
    label: '已阻断',
    className: 'bg-amber-500/15 text-amber-300',
  },
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

function toDisplayModeValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function getSuggestionStatusConfig(status: SuggestionStatus) {
  if (status === 'pending') {
    return null
  }

  return SUGGESTION_STATUS_CONFIG[status]
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
          <span className="text-zinc-400">
            {formatAutonomyModeValue(toDisplayModeValue(currentAutonomyMode))}
          </span>
          <span className="text-zinc-500">→</span>
          <span className="text-emerald-400">
            {formatAutonomyModeValue(toDisplayModeValue(suggestedAutonomyMode))}
          </span>
        </div>
      )
  }
}

interface OptimizationSuggestionCardProps {
  suggestion: OptimizationSuggestion
  onApply: (id: string) => void
  onDismiss: (id: string) => void
  actionsDisabled?: boolean
  /**
   * 该建议采纳后能否真正落到执行路径。false 时禁用「采纳」并给出说明，
   * 「忽略」保持可用，用户仍可把无效建议清掉。由调用方按建议类型判定。
   */
  canApply?: boolean
}

export const OptimizationSuggestionCard = memo(function OptimizationSuggestionCard({
  suggestion,
  onApply,
  onDismiss,
  actionsDisabled = false,
  canApply = true,
}: OptimizationSuggestionCardProps) {
  const typeLabel = SUGGESTION_TYPE_LABELS[suggestion.suggestionType]
  const isPending = suggestion.status === 'pending'
  const statusConfig = getSuggestionStatusConfig(suggestion.status)
  const policyBlock = suggestion.analysisMetadata?.policyBlock ?? null

  const handleApply = useCallback(() => {
    onApply(suggestion.id)
  }, [onApply, suggestion.id])

  const handleDismiss = useCallback(() => {
    onDismiss(suggestion.id)
  }, [onDismiss, suggestion.id])

  return (
    <div
      className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3"
      data-testid="optimization-suggestion-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-zinc-100">{typeLabel}</span>
        <div className="flex items-center gap-2">
          {statusConfig ? (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                statusConfig.className,
              )}
            >
              {statusConfig.label}
            </span>
          ) : null}
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

      <p className="text-xs leading-relaxed text-zinc-400">{suggestion.rationale}</p>

      {policyBlock ? (
        <div
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          data-testid="optimization-suggestion-policy-block"
        >
          <p className="font-medium text-amber-100">该建议已被组织自治策略阻断。</p>
          <p className="mt-1">{policyBlock.message}</p>
          <p className="mt-1 text-amber-100/90">
            当前建议：{formatAutonomyModeValue(policyBlock.rawMode)}；组织上限：
            {formatAutonomyModeValue(policyBlock.autonomyCap)}；建议改为：
            {formatAutonomyModeValue(policyBlock.replacementMode)}。
          </p>
        </div>
      ) : null}

      {suggestion.impactEstimate ? (
        <div className="flex flex-wrap gap-3 text-xs">
          {suggestion.impactEstimate.costSavingPct != null ? (
            <span className="text-emerald-400">成本 -{suggestion.impactEstimate.costSavingPct}%</span>
          ) : null}
          {suggestion.impactEstimate.latencyImpactPct != null ? (
            <span
              className={
                suggestion.impactEstimate.latencyImpactPct > 0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }
            >
              延迟 {suggestion.impactEstimate.latencyImpactPct > 0 ? '+' : ''}
              {suggestion.impactEstimate.latencyImpactPct}%
            </span>
          ) : null}
          {suggestion.impactEstimate.reliabilityImpactPct != null ? (
            <span
              className={
                suggestion.impactEstimate.reliabilityImpactPct < 0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }
            >
              可靠性 {suggestion.impactEstimate.reliabilityImpactPct > 0 ? '+' : ''}
              {suggestion.impactEstimate.reliabilityImpactPct}%
            </span>
          ) : null}
        </div>
      ) : null}

      {isPending ? (
        <div className="space-y-2 pt-1">
          {canApply ? null : (
            <p
              className="text-xs leading-relaxed text-zinc-500"
              data-testid="optimization-suggestion-no-effect-note"
            >
              该节点上的模型、工具、超时与自治级别字段不参与执行，采纳后不会产生任何效果。agent 节点的运行时配置来自所绑定的 Agent Definition，请到该 Agent 中调整。
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={actionsDisabled || !canApply}
              data-testid={canApply ? undefined : 'optimization-suggestion-apply-disabled'}
            >
              采纳
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              disabled={actionsDisabled}
            >
              忽略
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
})
