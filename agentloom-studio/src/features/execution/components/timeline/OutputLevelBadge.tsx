import { memo } from 'react'

import { StatusBadge, type StatusTone } from '@/shared/ui/status-badge'

/** 结构化输出等级 → 语义色；L1 最可靠、L4 已降级 */
const levelMeta: Record<1 | 2 | 3 | 4, { label: string; tone: StatusTone }> = {
  1: { label: 'L1 原生结构化', tone: 'success' },
  2: { label: 'L2 提示约束', tone: 'info' },
  3: { label: 'L3 验证修复', tone: 'warning' },
  4: { label: 'L4 降级解析', tone: 'error' },
}

interface OutputLevelBadgeProps {
  level: number | undefined | null
  className?: string
}

export const OutputLevelBadge = memo(function OutputLevelBadge({
  level,
  className,
}: OutputLevelBadgeProps) {
  if (level == null || level < 1 || level > 4) {
    return null
  }

  const meta = levelMeta[level as 1 | 2 | 3 | 4]

  return (
    <StatusBadge
      tone={meta.tone}
      size="sm"
      className={className}
      data-testid={`output-level-badge-${level}`}
    >
      {meta.label}
    </StatusBadge>
  )
})
