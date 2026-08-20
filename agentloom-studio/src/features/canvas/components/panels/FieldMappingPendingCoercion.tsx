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
    <div className="mapping-pending-coercion" data-testid="pending-coercion">
      <div className="mapping-pending-coercion__info">
        <AlertTriangle size={14} className="text-warning" />
        <span>
          {pending.sourceField} → {pending.targetField}
        </span>
        <span className="text-xs text-muted">
          ({pending.sourceType} → {pending.targetType})
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
