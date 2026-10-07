import { StatusBadge, type StatusTone } from '@/shared/ui/status-badge'

import type { EncryptionKeyStatus } from '../types'

const STATUS_TONE: Record<EncryptionKeyStatus, StatusTone> = {
  active: 'success',
  rotating: 'warning',
  revoked: 'error',
}

const STATUS_LABELS: Record<EncryptionKeyStatus, string> = {
  active: '活跃',
  rotating: '轮换中',
  revoked: '已撤销',
}

interface KeyStatusBadgeProps {
  status: EncryptionKeyStatus
  className?: string
}

export function KeyStatusBadge({ status, className }: KeyStatusBadgeProps) {
  return (
    <StatusBadge
      tone={STATUS_TONE[status]}
      dot
      pulse={status === 'rotating'}
      className={className}
      data-testid="key-status-badge"
    >
      {STATUS_LABELS[status]}
    </StatusBadge>
  )
}
