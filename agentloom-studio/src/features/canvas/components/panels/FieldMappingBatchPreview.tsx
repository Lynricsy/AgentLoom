import { Check, X } from 'lucide-react'
import type { BatchPreviewState } from '../../lib/fieldMappingBatch'
import type { CompatibilityLabel } from '../../types'

const COMPAT_LABEL_TEXT: Record<CompatibilityLabel, string> = {
  exact: '完全兼容',
  coercible: '可转换',
  incompatible: '不兼容',
}

const MATCH_TYPE_TEXT = {
  'exact-name': '精确',
  'normalized-name': '相似',
  order: '序号',
} as const

export interface FieldMappingBatchPreviewProps {
  preview: BatchPreviewState
  onConfirm: () => void
  onCancel: () => void
}

/** 批量拖拽 / 多选映射的确认预览：不兼容项会在确认时被跳过 */
export function FieldMappingBatchPreview({
  preview,
  onConfirm,
  onCancel,
}: FieldMappingBatchPreviewProps) {
  return (
    <div className="batch-preview" data-testid="batch-preview">
      <div className="batch-preview__header">
        批量映射预览 ({preview.items.length} 对)
      </div>
      <div className="batch-preview__list">
        {preview.items.map((item) => (
          <div
            key={`${item.sourceField}->${item.targetField}`}
            className={`batch-preview__item batch-preview__item--${item.compatibilityLabel}`}
            data-testid={`batch-preview-item-${item.targetField}`}
          >
            <span className="truncate">{item.sourceField}</span>
            <span className="shrink-0 text-muted">→</span>
            <span className="truncate">{item.targetField}</span>
            <span className={`batch-preview__match-type batch-preview__match-type--${item.matchType}`}>
              {MATCH_TYPE_TEXT[item.matchType]}
            </span>
            <span className={`batch-preview__compat batch-preview__compat--${item.compatibilityLabel}`}>
              {COMPAT_LABEL_TEXT[item.compatibilityLabel]}
            </span>
          </div>
        ))}

        {preview.unmatchedSources.length > 0 && (
          <div
            className="batch-preview__unmatched flex flex-col gap-1 rounded border border-dashed border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-foreground"
            data-testid="batch-preview-unmatched"
          >
            <span className="batch-preview__unmatched-title text-[10px] font-semibold text-warning">
              未匹配来源
            </span>
            <span>{preview.unmatchedSources.join('、')}</span>
          </div>
        )}
      </div>
      <div className="batch-preview__actions">
        <button
          type="button"
          data-testid="batch-preview-confirm"
          className="batch-preview__btn--confirm"
          onClick={onConfirm}
        >
          <Check size={12} />
          确认映射
        </button>
        <button
          type="button"
          data-testid="batch-preview-cancel"
          className="batch-preview__btn--cancel"
          onClick={onCancel}
        >
          <X size={12} />
          取消
        </button>
      </div>
    </div>
  )
}
