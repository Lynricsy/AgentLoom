import type { ExecutionStatus, ExecutionStepStatus } from '../types'
import type { ExecutionResponse } from '../api/executionApi'

export const executionStatusMeta: Record<ExecutionStatus, {
  label: string
  badgeClassName: string
  pulseClassName?: string
}> = {
  pending: {
    label: '等待中',
    badgeClassName: 'border-border bg-muted/40 text-muted-foreground',
    pulseClassName: 'bg-muted-foreground/70',
  },
  running: {
    label: '执行中',
    badgeClassName: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    pulseClassName: 'bg-sky-400',
  },
  paused: {
    label: '已暂停',
    badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    pulseClassName: 'bg-amber-400',
  },
  completed: {
    label: '已完成',
    badgeClassName: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    pulseClassName: 'bg-emerald-400',
  },
  failed: {
    label: '失败',
    badgeClassName: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    pulseClassName: 'bg-rose-400',
  },
  cancelled: {
    label: '已取消',
    badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    pulseClassName: 'bg-amber-400',
  },
}

export const stepStatusMeta: Record<ExecutionStepStatus, {
  label: string
  badgeClassName: string
  nodeClassName: string
  dotClassName: string
}> = {
  pending: {
    label: '等待中',
    badgeClassName: 'border-border bg-muted/40 text-muted-foreground',
    nodeClassName: 'border-border/80 bg-surface/95',
    dotClassName: 'bg-muted-foreground',
  },
  queued: {
    label: '排队中',
    badgeClassName: 'border-border bg-muted/40 text-muted-foreground',
    nodeClassName: 'border-border/80 bg-surface/95',
    dotClassName: 'bg-muted-foreground',
  },
  running: {
    label: '执行中',
    badgeClassName: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    nodeClassName: 'border-sky-400/80 bg-sky-500/5 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]',
    dotClassName: 'bg-sky-400',
  },
  waiting_for_intervention: {
    label: '等待干预',
    badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    nodeClassName: 'border-amber-400/80 bg-amber-500/5',
    dotClassName: 'bg-amber-400',
  },
  completed: {
    label: '已完成',
    badgeClassName: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    nodeClassName: 'border-emerald-400/80 bg-emerald-500/5',
    dotClassName: 'bg-emerald-400',
  },
  failed: {
    label: '失败',
    badgeClassName: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    nodeClassName: 'border-rose-400/80 bg-rose-500/5',
    dotClassName: 'bg-rose-400',
  },
  skipped: {
    label: '已跳过',
    badgeClassName: 'border-border bg-muted/40 text-muted-foreground',
    nodeClassName: 'border-border/70 border-dashed bg-background/80',
    dotClassName: 'bg-muted-foreground',
  },
  cancelled: {
    label: '已取消',
    badgeClassName: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    nodeClassName: 'border-amber-400/70 bg-amber-500/5',
    dotClassName: 'bg-amber-400',
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
    case 'scheduled':
      return '定时'
    case 'system':
      return '系统'
    case 'webhook':
      return 'Webhook'
    case 'manual':
    default:
      return '手动'
  }
}

export function getExecutionStartedAt(execution: ExecutionResponse): string {
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
