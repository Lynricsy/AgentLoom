import { Check, X } from 'lucide-react'
import { MappingSuggestionCard } from './MappingSuggestionCard'
import type { ApplyAllConfirmSummary } from '../../hooks/useFieldMappingInteractions'
import type { MappingSuggestion } from '../../types'

export interface FieldMappingSuggestionsProps {
  suggestionsByTarget: Map<string, MappingSuggestion>
  hasApplicableSuggestions: boolean
  applyAllConfirmData: ApplyAllConfirmSummary | null
  onApplySuggestion: (suggestion: MappingSuggestion) => void
  onApplyAll: () => void
  onConfirmApplyAll: () => void
  onCancelApplyAll: () => void
}

/** 名称 / 类型相似度推导的智能推荐，含「应用全部」确认摘要 */
export function FieldMappingSuggestions({
  suggestionsByTarget,
  hasApplicableSuggestions,
  applyAllConfirmData,
  onApplySuggestion,
  onApplyAll,
  onConfirmApplyAll,
  onCancelApplyAll,
}: FieldMappingSuggestionsProps) {
  return (
    <div className="mapping-panel__suggestions" data-testid="mapping-suggestions-section">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs text-muted">
          {suggestionsByTarget.size} 个智能推荐
        </span>
        {hasApplicableSuggestions && (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            data-testid="apply-all-suggestions"
            onClick={onApplyAll}
          >
            应用全部推荐
          </button>
        )}
      </div>

      {applyAllConfirmData && (
        <div className="apply-all-confirm" data-testid="apply-all-confirm">
          <div className="apply-all-confirm__summary">
            将应用 {applyAllConfirmData.toApply.length} 个推荐
            {applyAllConfirmData.coercibleCount > 0 && (
              <span className="apply-all-confirm__coercible">
                （{applyAllConfirmData.coercibleCount} 个需要类型转换）
              </span>
            )}
            {applyAllConfirmData.skippedIncompatibleCount > 0 && (
              <span className="apply-all-confirm__coercible">
                （{applyAllConfirmData.skippedIncompatibleCount} 个不兼容已跳过）
              </span>
            )}
          </div>
          <div className="apply-all-confirm__actions">
            <button
              type="button"
              data-testid="apply-all-confirm-btn"
              className="apply-all-confirm__btn--confirm"
              onClick={onConfirmApplyAll}
            >
              <Check size={12} />
              确认
            </button>
            <button
              type="button"
              data-testid="apply-all-cancel-btn"
              className="apply-all-confirm__btn--cancel"
              onClick={onCancelApplyAll}
            >
              <X size={12} />
              取消
            </button>
          </div>
        </div>
      )}

      {[...suggestionsByTarget.values()].map((s) => (
        <MappingSuggestionCard
          key={`suggestion-${s.targetField}`}
          suggestion={s}
          onApply={onApplySuggestion}
        />
      ))}
    </div>
  )
}
