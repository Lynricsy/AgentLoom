import { memo, useCallback } from 'react'
import { OptimizationSuggestionCard } from './OptimizationSuggestionCard'
import {
  useNodeSuggestions,
  useApplySuggestion,
  useDismissSuggestion,
} from '../api/optimization-suggestion-queries'

interface OptimizationSuggestionsPanelProps {
  workflowDefinitionId: string
  nodeId: string
}

export const OptimizationSuggestionsPanel = memo(
  function OptimizationSuggestionsPanel({
    workflowDefinitionId,
    nodeId,
  }: OptimizationSuggestionsPanelProps) {
    const {
      data: suggestions,
      isLoading,
      isError,
      error,
    } = useNodeSuggestions(workflowDefinitionId, nodeId)

    const applyMutation = useApplySuggestion()
    const dismissMutation = useDismissSuggestion()

    const handleApply = useCallback(
      (id: string) => {
        applyMutation.mutate(id)
      },
      [applyMutation],
    )

    const handleDismiss = useCallback(
      (id: string) => {
        dismissMutation.mutate(id)
      },
      [dismissMutation],
    )

    if (isLoading) {
      return (
        <div
          className="space-y-3 px-4 py-3"
          data-testid="optimization-suggestions-panel"
        >
          {['skeleton-1', 'skeleton-2'].map((key) => (
            <div
              key={key}
              className="animate-pulse rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-2"
            >
              <div className="h-4 w-28 rounded bg-zinc-700/60" />
              <div className="h-3 w-full rounded bg-zinc-700/40" />
              <div className="h-3 w-2/3 rounded bg-zinc-700/40" />
            </div>
          ))}
        </div>
      )
    }

    if (isError) {
      return (
        <div
          className="px-4 py-3 text-sm text-red-400"
          data-testid="optimization-suggestions-panel"
        >
          加载优化建议失败: {error?.message ?? '未知错误'}
        </div>
      )
    }

    if (!suggestions || suggestions.length === 0) {
      return (
        <div
          className="px-4 py-3 text-sm text-zinc-500"
          data-testid="optimization-suggestions-panel"
        >
          暂无优化建议
        </div>
      )
    }

    return (
      <div
        className="space-y-3 px-4 py-3"
        data-testid="optimization-suggestions-panel"
      >
        <h3 className="text-sm font-medium text-zinc-200">
          优化建议
          <span className="ml-1.5 text-xs text-zinc-500">
            ({suggestions.length})
          </span>
        </h3>
        {suggestions.map((suggestion) => (
          <OptimizationSuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onApply={handleApply}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    )
  },
)
