import { AlertTriangle } from 'lucide-react'
import { CoercionConfigPopover } from './CoercionConfigPopover'
import type { PendingCoercion } from '../../hooks/useFieldMappingInteractions'
import type { TypeCoercionConfig } from '../../types'

export interface FieldMappingPendingCoercionProps {
  pending: PendingCoercion
  onConfirm: (config: TypeCoercionConfig) => void
  onCancel: () => void
}

/** 类型可转换映射的确认流：取消时回滚到写入前的快照 */
export function FieldMappingPendingCoercion({
  pending,
  onConfirm,
  onCancel,
}: FieldMappingPendingCoercionProps) {
  return (
    <div
      className="mx-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs"
      data-testid="pending-coercion"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-warning">
        <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate font-mono" title={pending.sourceField}>
          {pending.sourceField}
        </span>
        <span className="shrink-0">→</span>
        <span className="min-w-0 truncate font-mono" title={pending.targetField}>
          {pending.targetField}
        </span>
        <span className="shrink-0 text-muted-foreground">
          （{pending.sourceType} → {pending.targetType}）
        </span>
      </div>
      <CoercionConfigPopover
        sourceType={pending.sourceType}
        targetType={pending.targetType}
        value={pending.initialConfig}
        mode="confirm"
        defaultOpen
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>
  )
}
