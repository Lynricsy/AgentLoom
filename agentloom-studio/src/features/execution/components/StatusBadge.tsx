import { memo, type ReactNode } from 'react'

import { StatusBadge } from '@/shared/ui/status-badge'

import type { ExecutionStatus, ExecutionStepStatus } from '../types'
import { executionStatusMeta, stepStatusMeta } from '../lib/presentation'

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
    <StatusBadge
      tone={meta.tone}
      dot
      pulse={status === 'running'}
      className={className}
      data-testid="execution-status-badge"
    >
      {prefix ? <>{prefix} </> : null}
      {meta.label}
    </StatusBadge>
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
    <StatusBadge
      tone={meta.tone}
      dot
      pulse={status === 'running'}
      className={className}
      data-testid="step-status-badge"
    >
      {prefix ? <>{prefix} </> : null}
      {meta.label}
    </StatusBadge>
  )
})
