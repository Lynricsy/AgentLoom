import { memo, useCallback } from 'react'
import { formatAutonomyModeValue } from '@/features/organization-autonomy-policy'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { StatusBadge, type StatusTone } from '@/shared/ui/status-badge'
import { SUGGESTION_TYPE_LABELS } from '../lib/suggestionPresentation'
import type {
  OptimizationSuggestion,
  SuggestionStatus,
  SuggestionType,
} from '../types/optimization-suggestion.types'

const SUGGESTION_STATUS_CONFIG: Record<
  Exclude<SuggestionStatus, 'pending'>,
  { label: string; tone: StatusTone }
> = {
  applied: { label: '已采纳', tone: 'success' },
  dismissed: { label: '已忽略', tone: 'neutral' },
  blocked: { label: '已阻断', tone: 'warning' },
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
          <span className="text-muted-foreground">{String(currentValue.model ?? currentValue.modelId ?? '—')}</span>
          <span className="text-subtle-foreground">→</span>
          <span className="text-success">{String(suggestedValue.model ?? suggestedValue.modelId ?? '—')}</span>
        </div>
      )
    case 'timeout_adjustment':
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{String(currentValue.timeoutMs ?? '—')}ms</span>
          <span className="text-subtle-foreground">→</span>
          <span className="text-success">{String(suggestedValue.timeoutMs ?? '—')}ms</span>
        </div>
      )
    case 'tool_pruning': {
      const removedTools = Array.isArray(suggestedValue.removedTools)
        ? suggestedValue.removedTools
        : []
      return (
        <div className="text-sm">
          <span className="text-muted-foreground">移除工具: </span>
          <span className="text-warning">
            {removedTools.length > 0 ? removedTools.join(', ') : '—'}
          </span>
        </div>
      )
    }
    case 'autonomy_upgrade':
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {formatAutonomyModeValue(toDisplayModeValue(currentAutonomyMode))}
          </span>
          <span className="text-subtle-foreground">→</span>
          <span className="text-success">
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
    <Card
      className="space-y-2 p-3"
      data-testid="optimization-suggestion-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{typeLabel}</span>
        <div className="flex items-center gap-2">
          {statusConfig ? (
            <StatusBadge tone={statusConfig.tone}>{statusConfig.label}</StatusBadge>
          ) : null}
          <StatusBadge
            tone={
              suggestion.confidence >= 0.8
                ? 'success'
                : suggestion.confidence >= 0.6
                  ? 'warning'
                  : 'error'
            }
          >
            {formatConfidence(suggestion.confidence)}
          </StatusBadge>
        </div>
      </div>

      <div className="rounded-md bg-muted px-2.5 py-2">
        {renderCurrentVsSuggested(
          suggestion.suggestionType,
          suggestion.currentValue,
          suggestion.suggestedValue,
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{suggestion.rationale}</p>

      {policyBlock ? (
        <div
          className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
          data-testid="optimization-suggestion-policy-block"
        >
          <p className="font-medium">该建议已被组织自治策略阻断。</p>
          <p className="mt-1">{policyBlock.message}</p>
          <p className="mt-1">
            当前建议：{formatAutonomyModeValue(policyBlock.rawMode)}；组织上限：
            {formatAutonomyModeValue(policyBlock.autonomyCap)}；建议改为：
            {formatAutonomyModeValue(policyBlock.replacementMode)}。
          </p>
        </div>
      ) : null}

      {suggestion.impactEstimate ? (
        <div className="flex flex-wrap gap-3 text-xs">
          {suggestion.impactEstimate.costSavingPct != null ? (
            <span className="text-success">成本 -{suggestion.impactEstimate.costSavingPct}%</span>
          ) : null}
          {suggestion.impactEstimate.latencyImpactPct != null ? (
            <span
              className={
                suggestion.impactEstimate.latencyImpactPct > 0
                  ? 'text-warning'
                  : 'text-success'
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
                  ? 'text-warning'
                  : 'text-success'
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
              className="text-xs leading-relaxed text-subtle-foreground"
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
    </Card>
  )
})
