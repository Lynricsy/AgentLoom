import { memo, type ReactNode } from 'react'
import { motion } from 'motion/react'

import { Badge } from '@/shared/ui/badge'
import { DUR, EASE } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'

import type { ExecutionStatus, ExecutionStepStatus } from '../types'
import { executionStatusMeta, stepStatusMeta } from '../lib/presentation'

interface StatusDotProps {
  className?: string
  /** 执行中状态的呼吸动画；其余状态保持静止 */
  pulse?: boolean
}

/**
 * 状态圆点。running 态用 motion 做呼吸（透明度 + 缩放往复），
 * 时长/缓动一律取自全局动画规范，系统「减少动态效果」时由 MotionConfig 自动降级。
 */
export const StatusDot = memo(function StatusDot({
  className,
  pulse = false,
}: StatusDotProps) {
  const shape = cn('h-2 w-2 shrink-0 rounded-full', className)

  if (!pulse) {
    return <span aria-hidden className={shape} />
  }

  return (
    <motion.span
      aria-hidden
      className={shape}
      animate={{ opacity: 0.35, scale: 0.7 }}
      transition={{
        duration: DUR.slow,
        ease: EASE,
        repeat: Infinity,
        repeatType: 'reverse',
      }}
    />
  )
})

interface StatusBadgeProps {
  className?: string
  /** 标签前缀，如「执行」「节点」 */
  prefix?: ReactNode
}

/** 执行级状态徽章 */
export const ExecutionStatusBadge = memo(function ExecutionStatusBadge({
  status,
  prefix,
  className,
}: StatusBadgeProps & { status: ExecutionStatus }) {
  const meta = executionStatusMeta[status]

  return (
    <Badge
      variant={meta.variant}
      className={className}
      data-testid="execution-status-badge"
    >
      <StatusDot className={meta.dotClassName} pulse={status === 'running'} />
      {prefix ? <>{prefix} </> : null}
      {meta.label}
    </Badge>
  )
})

/** 步骤级状态徽章 */
export const StepStatusBadge = memo(function StepStatusBadge({
  status,
  prefix,
  className,
}: StatusBadgeProps & { status: ExecutionStepStatus }) {
  const meta = stepStatusMeta[status]

  return (
    <Badge
      variant={meta.variant}
      className={className}
      data-testid="step-status-badge"
    >
      <StatusDot
        className={cn('h-1.5 w-1.5', meta.dotClassName)}
        pulse={status === 'running'}
      />
      {prefix ? <>{prefix} </> : null}
      {meta.label}
    </Badge>
  )
})
