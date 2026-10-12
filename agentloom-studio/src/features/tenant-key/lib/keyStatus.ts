import type { StatusTone } from '@/shared/ui/status-badge'

import type { EncryptionKeyStatus } from '../types'

/** 密钥状态 → 文案与 StatusBadge 语气 */
export const KEY_STATUS_META: Record<EncryptionKeyStatus, { label: string; tone: StatusTone }> = {
  active: { label: '活跃', tone: 'success' },
  rotating: { label: '轮换中', tone: 'warning' },
  revoked: { label: '已撤销', tone: 'error' },
}
