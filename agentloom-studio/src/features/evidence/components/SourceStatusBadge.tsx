import { memo } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { AlertTriangle, Ban, Check, Loader2 } from 'lucide-react'
import { cva } from 'class-variance-authority'

import { cn } from '@/shared/lib/utils'

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

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
  {
    variants: {
      status: {
        valid: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600',
        modified: 'border-amber-500/20 bg-amber-500/10 text-amber-600',
        unavailable: 'border-border/60 bg-muted text-muted-foreground',
      },
    },
  },
)

function deriveStatus(props: SourceStatusBadgeProps): SourceStatus {
  if (props.sourceUnavailable) return 'unavailable'
  if (props.sourceModified || !props.hashValid) return 'modified'
  return 'valid'
}

const statusConfig: Record<
  SourceStatus,
  { icon: typeof Check; label: string }
> = {
  valid: { icon: Check, label: '来源完整' },
  modified: { icon: AlertTriangle, label: '来源已修改' },
  unavailable: { icon: Ban, label: '来源不可用' },
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
  const showSnapshotToggle =
    props.hasOriginalSnapshot &&
    (status === 'modified' || status === 'unavailable') &&
    props.onToggleOriginalSnapshot

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', props.className)}>
      <Tooltip.Provider delayDuration={0}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              className={cn(
                badgeVariants({ status }),
                status === 'valid' ? 'cursor-default' : 'cursor-help',
              )}
              data-testid="source-status-badge"
            >
              <Icon className="h-3 w-3" />
              {config.label}
              {props.isVerifying && status !== 'unavailable' && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
            </button>
          </Tooltip.Trigger>
          {tooltipLines.length > 0 && (
            <Tooltip.Portal>
              <Tooltip.Content
                side="top"
                className="z-50 max-w-xs rounded-lg border border-border/60 bg-popover px-3 py-2 text-left text-[11px] text-popover-foreground shadow-lg"
              >
                <div className="space-y-1">
                  {tooltipLines.map((line) => (
                    <p key={line} className="break-all leading-relaxed">
                      {line}
                    </p>
                  ))}
                </div>
                <Tooltip.Arrow className="fill-popover" />
              </Tooltip.Content>
            </Tooltip.Portal>
          )}
        </Tooltip.Root>
      </Tooltip.Provider>

      {showSnapshotToggle && (
        <button
          type="button"
          className="text-[11px] font-medium text-primary transition hover:text-primary/80 hover:underline"
          onClick={(event) => {
            event.stopPropagation()
            props.onToggleOriginalSnapshot?.()
          }}
          data-testid="toggle-original-snapshot"
        >
          {props.snapshotVisible ? '隐藏原始快照' : '查看原始快照'}
        </button>
      )}
    </div>
  )
})
