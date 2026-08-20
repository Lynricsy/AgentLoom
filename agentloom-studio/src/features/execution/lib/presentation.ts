import type { BadgeProps } from '@/shared/ui/badge'
import type { ExecutionStatus, ExecutionStepStatus } from '../types'
import type { ExecutionResponse } from '../api/executionApi'

/** shared/ui Badge 的语义变体，状态色一律走设计令牌 */
type StatusVariant = NonNullable<BadgeProps['variant']>

export const executionStatusMeta: Record<ExecutionStatus, {
  label: string
  variant: StatusVariant
  /** 状态圆点底色（令牌类） */
  dotClassName: string
}> = {
  pending: {
    label: '等待中',
    variant: 'secondary',
    dotClassName: 'bg-muted-foreground',
  },
  running: {
    label: '执行中',
    variant: 'info',
    dotClassName: 'bg-info',
  },
  paused: {
    label: '已暂停',
    variant: 'warning',
    dotClassName: 'bg-warning',
  },
  completed: {
    label: '已完成',
    variant: 'success',
    dotClassName: 'bg-success',
  },
  failed: {
    label: '失败',
    variant: 'error',
    dotClassName: 'bg-error',
  },
  cancelled: {
    label: '已取消',
    variant: 'warning',
    dotClassName: 'bg-warning',
  },
}

export const stepStatusMeta: Record<ExecutionStepStatus, {
  label: string
  variant: StatusVariant
  /** 只读画布节点卡片的描边/底色 */
  nodeClassName: string
  dotClassName: string
}> = {
  pending: {
    label: '等待中',
    variant: 'secondary',
    nodeClassName: 'border-border bg-surface',
    dotClassName: 'bg-muted-foreground',
  },
  queued: {
    label: '排队中',
    variant: 'secondary',
    nodeClassName: 'border-border bg-surface',
    dotClassName: 'bg-muted-foreground',
  },
  running: {
    label: '执行中',
    variant: 'info',
    nodeClassName: 'border-info/60 bg-info/5 shadow-node',
    dotClassName: 'bg-info',
  },
  waiting_for_intervention: {
    label: '等待干预',
    variant: 'warning',
    nodeClassName: 'border-warning/60 bg-warning/5',
    dotClassName: 'bg-warning',
  },
  completed: {
    label: '已完成',
    variant: 'success',
    nodeClassName: 'border-success/60 bg-success/5',
    dotClassName: 'bg-success',
  },
  failed: {
    label: '失败',
    variant: 'error',
    nodeClassName: 'border-error/60 bg-error/5',
    dotClassName: 'bg-error',
  },
  skipped: {
    label: '已跳过',
    variant: 'secondary',
    nodeClassName: 'border-dashed border-border bg-background',
    dotClassName: 'bg-muted-foreground',
  },
  cancelled: {
    label: '已取消',
    variant: 'warning',
    nodeClassName: 'border-warning/50 bg-warning/5',
    dotClassName: 'bg-warning',
  },
}

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function formatExecutionDateTime(value: string | null | undefined): string {
  if (!value) {
    return '未开始'
  }

  return dateTimeFormatter.format(new Date(value))
}

export function formatExecutionDuration(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
): string {
  if (!startedAt) {
    return '未开始'
  }

  if (!completedAt) {
    return '进行中'
  }

  const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
  const totalSeconds = Math.floor(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export function formatClockTime(value: string | null | undefined): string {
  if (!value) {
    return '--:--:--'
  }

  return timeFormatter.format(new Date(value))
}

export function formatTriggerSource(
  triggerType: ExecutionResponse['triggerType'],
): string {
  switch (triggerType) {
    case 'api':
      return 'API'
    case 'system':
      // cron 触发的执行由 trigger-scheduler 以 triggerType: 'system' 记录，
      // DB 枚举中没有 'scheduled'
      return '系统'
    case 'webhook':
      return 'Webhook'
    case 'manual':
    default:
      return '手动'
  }
}

export function getExecutionStartedAt(
  execution: Pick<ExecutionResponse, 'startedAt' | 'createdAt'>,
): string {
  return execution.startedAt ?? execution.createdAt
}

export function summarizeDataShape(value: Record<string, unknown> | null | undefined): string {
  if (!value) {
    return '无数据'
  }

  const keys = Object.keys(value)
  const bytes = new Blob([JSON.stringify(value)]).size
  const size = bytes >= 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${bytes}B`
  return `${keys.length} fields, ${size}`
}
