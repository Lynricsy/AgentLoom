import { memo } from 'react'
import { AlertTriangle, Ban, Check, Loader2 } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { StatusBadge, type StatusTone } from '@/shared/ui/status-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/tooltip'

type SourceStatus = 'valid' | 'modified' | 'unavailable'

interface SourceStatusBadgeProps {
  hashValid: boolean
  sourceModified?: boolean
  sourceUnavailable?: boolean
  unavailableReason?: string
  createdAt?: string
  originalHash?: string
  currentHash?: string
  isVerifying?: boolean
  verifyError?: string
  hasOriginalSnapshot?: boolean
  snapshotVisible?: boolean
  onToggleOriginalSnapshot?: () => void
  className?: string
}

function deriveStatus(props: SourceStatusBadgeProps): SourceStatus {
  if (props.sourceUnavailable) return 'unavailable'
  if (props.sourceModified || !props.hashValid) return 'modified'
  return 'valid'
}

const statusConfig: Record<
  SourceStatus,
  { icon: typeof Check; label: string; tone: StatusTone }
> = {
  valid: { icon: Check, label: '来源完整', tone: 'success' },
  modified: { icon: AlertTriangle, label: '来源已修改', tone: 'warning' },
  unavailable: { icon: Ban, label: '来源不可用', tone: 'neutral' },
}

function formatTimestamp(value?: string): string {
  if (!value) return '未知'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function renderTooltipContent(
  status: SourceStatus,
  props: SourceStatusBadgeProps,
): string[] {
  if (status === 'valid') {
    return []
  }

  if (status === 'unavailable') {
    return [
      '源文档不可用',
      props.unavailableReason ?? '未返回不可用原因',
      `原始快照时间：${formatTimestamp(props.createdAt)}`,
      `原始哈希：${props.originalHash ?? '未知'}`,
    ]
  }

  return [
    '源文档已修改',
    `原始快照时间：${formatTimestamp(props.createdAt)}`,
    props.isVerifying
      ? '当前哈希：正在验证…'
      : `当前哈希：${props.currentHash ?? props.verifyError ?? '验证失败'}`,
    `原始哈希：${props.originalHash ?? '未知'}`,
  ]
}

export const SourceStatusBadge = memo(function SourceStatusBadge(
  props: SourceStatusBadgeProps,
) {
  const status = deriveStatus(props)
  const config = statusConfig[status]
  const Icon = config.icon
  const tooltipLines = renderTooltipContent(status, props)
  const hasTooltip = tooltipLines.length > 0
  const showSnapshotToggle =
    props.hasOriginalSnapshot &&
    (status === 'modified' || status === 'unavailable') &&
    props.onToggleOriginalSnapshot

  const badge = (
    <StatusBadge
      tone={config.tone}
      size="sm"
      // 有提示时可聚焦，键盘用户同样能唤起哈希详情
      tabIndex={hasTooltip ? 0 : undefined}
      className={cn('px-2', hasTooltip && 'cursor-help')}
      data-testid="source-status-badge"
    >
      <Icon className="size-3" />
      {config.label}
      {props.isVerifying && status !== 'unavailable' && (
        <Loader2 className="size-3 animate-spin" />
      )}
    </StatusBadge>
  )

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', props.className)}>
      {hasTooltip ? (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>{badge}</TooltipTrigger>
            <TooltipContent side="top" className="text-left text-2xs">
              <div className="space-y-1">
                {tooltipLines.map((line) => (
                  <p key={line} className="break-all leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        badge
      )}

      {showSnapshotToggle && (
        <Button
          variant="link"
          size="xs"
          className="h-auto p-0 text-2xs font-medium"
          onClick={(event) => {
            event.stopPropagation()
            props.onToggleOriginalSnapshot?.()
          }}
          data-testid="toggle-original-snapshot"
        >
          {props.snapshotVisible ? '隐藏原始快照' : '查看原始快照'}
        </Button>
      )}
    </div>
  )
})
