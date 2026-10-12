import { ArrowRightLeft } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { CanvasPanelHeader } from '../CanvasPanelHeader'

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
      <CanvasPanelHeader
        icon={ArrowRightLeft}
        title="字段映射"
        onClose={onClose}
        closeLabel="关闭映射面板"
        closeTestId="mapping-panel-close"
      />

      <div
        className={cn(
          'shrink-0 border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground',
          !isReadonly && requiredUnmappedCount > 0 && 'text-warning',
        )}
        data-testid="mapping-required-summary"
      >
        {isReadonly
          ? '完全匹配，无需映射'
          : requiredUnmappedCount > 0
            ? `${requiredUnmappedCount} 个必填字段未映射`
            : '所有必填字段已映射'}
      </div>
    </>
  )
}
