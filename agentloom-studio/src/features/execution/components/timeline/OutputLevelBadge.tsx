import { memo } from 'react'
import { cva } from 'class-variance-authority'

import { cn } from '@/shared/lib/utils'

const outputLevelVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
  {
    variants: {
      level: {
        1: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
        2: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
        3: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
        4: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
      },
    },
  },
)

const levelLabels: Record<number, string> = {
  1: 'L1 原生结构化',
  2: 'L2 提示约束',
  3: 'L3 验证修复',
  4: 'L4 降级解析',
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

  return (
    <span
      className={cn(
        outputLevelVariants({ level: level as 1 | 2 | 3 | 4 }),
        className,
      )}
      data-testid={`output-level-badge-${level}`}
    >
      {levelLabels[level]}
    </span>
  )
})
