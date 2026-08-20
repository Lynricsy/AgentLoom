import { X } from 'lucide-react'

export interface FieldMappingSummaryProps {
  isReadonly: boolean
  requiredUnmappedCount: number
  onClose: () => void
}

/** 面板头部与必填字段映射摘要 */
export function FieldMappingSummary({
  isReadonly,
  requiredUnmappedCount,
  onClose,
}: FieldMappingSummaryProps) {
  return (
    <>
      <div className="mapping-panel__header">
        <h3 className="mapping-panel__title">字段映射</h3>
        <button
          type="button"
          className="mapping-panel__close"
          data-testid="mapping-panel-close"
          aria-label="关闭映射面板"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      <div className="mapping-panel__summary" data-testid="mapping-required-summary">
        {isReadonly ? (
          <span>完全匹配，无需映射</span>
        ) : requiredUnmappedCount > 0 ? (
          <span className="mapping-panel__summary-item--warning">
            {requiredUnmappedCount} 个必填字段未映射
          </span>
        ) : (
          <span>所有必填字段已映射</span>
        )}
      </div>
    </>
  )
}
