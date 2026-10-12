import { memo } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { StatusBadge, StatusDot } from '@/shared/ui/status-badge'

import type { ExecutionStepStatus } from '../../types'
import {
  formatExecutionDuration,
  STEP_STATUS_META,
} from '../../lib/presentation'

interface TimelineHeaderProps {
  nodeName: string
  nodeType: string
  status: ExecutionStepStatus
  startedAt: string | null
  completedAt: string | null
  /** 传入时在第一行末尾渲染折叠 chevron */
  expanded?: boolean
}

/**
 * 步骤头部固定两行：
 * 1. 状态点 + 节点名（截断）+ 类型 + chevron
 * 2. 耗时 + 状态徽章
 * 不使用 flex-wrap，保证列表内各步骤行高一致。
 */
export const TimelineHeader = memo(function TimelineHeader({
  nodeName,
  nodeType,
  status,
  startedAt,
  completedAt,
  expanded,
}: TimelineHeaderProps) {
  const meta = STEP_STATUS_META[status]

  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="timeline-header">
      <div className="flex min-w-0 items-center gap-2">
        <StatusDot
          tone={meta.tone}
          className="size-2.5"
          pulse={status === 'running'}
        />
        <p className="min-w-0 truncate text-sm font-semibold text-foreground" title={nodeName}>
          {nodeName}
        </p>
        <span className="shrink-0 text-2xs uppercase tracking-wider text-muted-foreground">
          {nodeType}
        </span>
        {expanded === undefined ? null : (
          <ChevronDown
            aria-hidden
            className={cn(
              'ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              !expanded && '-rotate-90',
            )}
          />
        )}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {formatExecutionDuration(startedAt, completedAt)}
        </span>
        <StatusBadge tone={meta.tone} data-testid="step-status-badge">
          {meta.label}
        </StatusBadge>
      </div>
    </div>
  )
})
