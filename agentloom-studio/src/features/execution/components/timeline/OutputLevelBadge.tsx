import { memo } from 'react'

import { Badge, type BadgeProps } from '@/shared/ui/badge'

/** 结构化输出等级 → 语义色；L1 最可靠、L4 已降级 */
const levelMeta: Record<
  1 | 2 | 3 | 4,
  { label: string; variant: NonNullable<BadgeProps['variant']> }
> = {
  1: { label: 'L1 原生结构化', variant: 'success' },
  2: { label: 'L2 提示约束', variant: 'info' },
  3: { label: 'L3 验证修复', variant: 'warning' },
  4: { label: 'L4 降级解析', variant: 'error' },
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
    <Badge
      variant={meta.variant}
      size="sm"
      className={className}
      data-testid={`output-level-badge-${level}`}
    >
      {meta.label}
    </Badge>
  )
})
