import { AnimatePresence, motion } from 'motion/react'
import { Check, X } from 'lucide-react'
import { fadeInUp } from '@/shared/lib/motion'
import { Button } from '@/shared/ui/button'
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
    <div className="flex flex-col gap-2 px-3" data-testid="mapping-suggestions-section">
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-xs text-muted-foreground">
          {suggestionsByTarget.size} 个智能推荐
        </span>
        {hasApplicableSuggestions && (
          <Button
            variant="link"
            size="xs"
            className="px-0"
            data-testid="apply-all-suggestions"
            onClick={onApplyAll}
          >
            应用全部推荐
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {applyAllConfirmData ? (
          <motion.div
            key="apply-all-confirm"
            {...fadeInUp}
            className="space-y-2 rounded-lg border border-border bg-muted p-3 text-xs text-foreground"
            data-testid="apply-all-confirm"
          >
            <p>
              将应用 {applyAllConfirmData.toApply.length} 个推荐
              {applyAllConfirmData.coercibleCount > 0 && (
                <span className="text-warning">
                  （{applyAllConfirmData.coercibleCount} 个需要类型转换）
                </span>
              )}
              {applyAllConfirmData.skippedIncompatibleCount > 0 && (
                <span className="text-warning">
                  （{applyAllConfirmData.skippedIncompatibleCount} 个不兼容已跳过）
                </span>
              )}
            </p>
            <div className="flex gap-1.5">
              <Button
                size="xs"
                data-testid="apply-all-confirm-btn"
                onClick={onConfirmApplyAll}
              >
                <Check />
                确认
              </Button>
              <Button
                variant="outline"
                size="xs"
                data-testid="apply-all-cancel-btn"
                onClick={onCancelApplyAll}
              >
                <X />
                取消
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
