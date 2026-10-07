import type { StatusTone } from '@/shared/ui/status-badge'
import type { ExecutionStatus, ExecutionStepStatus } from '../types'
import type { ExecutionResponse } from '../api/executionApi'

export const executionStatusMeta: Record<ExecutionStatus, {
  label: string
  tone: StatusTone
}> = {
  pending: { label: '等待中', tone: 'neutral' },
  running: { label: '执行中', tone: 'info' },
  paused: { label: '已暂停', tone: 'warning' },
  completed: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'error' },
  cancelled: { label: '已取消', tone: 'warning' },
}

export const stepStatusMeta: Record<ExecutionStepStatus, {
  label: string
  tone: StatusTone
  /** 只读画布节点卡片的描边/底色 */
  nodeClassName: string
}> = {
  pending: {
    label: '等待中',
    tone: 'neutral',
    nodeClassName: 'border-border bg-surface',
  },
  queued: {
    label: '排队中',
    tone: 'neutral',
    nodeClassName: 'border-border bg-surface',
  },
  running: {
    label: '执行中',
    tone: 'info',
    nodeClassName: 'border-info/60 bg-info/5 shadow-sm',
  },
  waiting_for_intervention: {
    label: '等待干预',
    tone: 'warning',
    nodeClassName: 'border-warning/60 bg-warning/5',
  },
  completed: {
    label: '已完成',
    tone: 'success',
    nodeClassName: 'border-success/60 bg-success/5',
  },
  failed: {
    label: '失败',
    tone: 'error',
    nodeClassName: 'border-error/60 bg-error/5',
  },
  skipped: {
    label: '已跳过',
    tone: 'neutral',
    nodeClassName: 'border-dashed border-border bg-background',
  },
  cancelled: {
    label: '已取消',
    tone: 'warning',
    nodeClassName: 'border-warning/50 bg-warning/5',
  },
}

/**
 * 语气 → 块状填充底色。
 * StatusDot 只出圆点，时长条/进度条这类块状填充复用同一套语气取色。
 */
export const toneFillClass: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
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
