import { Check, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Badge, type BadgeProps } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import type { BatchPreviewState } from '../../lib/fieldMappingBatch'
import type { CompatibilityLabel } from '../../types'

const COMPAT_LABEL_TEXT: Record<CompatibilityLabel, string> = {
  exact: '完全兼容',
  coercible: '可转换',
  incompatible: '不兼容',
}

const COMPAT_TEXT_CLASS: Record<CompatibilityLabel, string> = {
  exact: 'text-success',
  coercible: 'text-warning',
  incompatible: 'text-error',
}

const COMPAT_ROW_CLASS: Record<CompatibilityLabel, string> = {
  exact: 'bg-success/5',
  coercible: 'bg-warning/5',
  incompatible: 'bg-error/5 opacity-60 line-through',
}

const MATCH_TYPE_META = {
  'exact-name': { text: '精确', variant: 'info' },
  'normalized-name': { text: '相似', variant: 'default' },
  order: { text: '序号', variant: 'secondary' },
} as const satisfies Record<
  string,
  { text: string; variant: NonNullable<BadgeProps['variant']> }
>

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
    <div
      className="mx-3 space-y-2 rounded-lg border border-border bg-muted p-3"
      data-testid="batch-preview"
    >
      <p className="text-xs font-semibold text-foreground">
        批量映射预览（{preview.items.length} 对）
      </p>
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {preview.items.map((item) => (
          <div
            key={`${item.sourceField}->${item.targetField}`}
            className={cn(
              'flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 font-mono text-2xs text-foreground',
              COMPAT_ROW_CLASS[item.compatibilityLabel],
            )}
            data-testid={`batch-preview-item-${item.targetField}`}
          >
            <span className="min-w-0 truncate" title={item.sourceField}>
              {item.sourceField}
            </span>
            <span className="shrink-0 text-muted-foreground">→</span>
            <span className="min-w-0 truncate" title={item.targetField}>
              {item.targetField}
            </span>
            <Badge
              size="sm"
              variant={MATCH_TYPE_META[item.matchType].variant}
              className="shrink-0 font-sans"
            >
              {MATCH_TYPE_META[item.matchType].text}
            </Badge>
            <span
              className={cn(
                'ml-auto shrink-0 font-sans',
                COMPAT_TEXT_CLASS[item.compatibilityLabel],
              )}
            >
              {COMPAT_LABEL_TEXT[item.compatibilityLabel]}
            </span>
          </div>
        ))}

        {preview.unmatchedSources.length > 0 && (
          <div
            className="flex flex-col gap-1 rounded-md border border-dashed border-warning/30 bg-warning/10 px-2 py-1.5 text-2xs text-foreground"
            data-testid="batch-preview-unmatched"
          >
            <span className="font-semibold text-warning">未匹配来源</span>
            <span className="break-all">{preview.unmatchedSources.join('、')}</span>
          </div>
        )}
      </div>
      <div className="flex gap-1.5">
        <Button
          size="xs"
          data-testid="batch-preview-confirm"
          onClick={onConfirm}
        >
          <Check />
          确认映射
        </Button>
        <Button
          variant="outline"
          size="xs"
          data-testid="batch-preview-cancel"
          onClick={onCancel}
        >
          <X />
          取消
        </Button>
      </div>
    </div>
  )
}
