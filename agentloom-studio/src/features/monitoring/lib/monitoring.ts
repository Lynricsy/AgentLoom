import type {
  MonitoringAlertCategory,
  MonitoringAlertSeverity,
  MonitoringDashboard,
  MonitoringHotspotKind,
  MonitoringHotspotStatus,
  MonitoringLinkTarget,
  MonitoringMetricSource,
  MonitoringRiskLevel,
  MonitoringWindow,
} from '../types/monitoring'

export const DEFAULT_MONITORING_WINDOW: MonitoringWindow = '1h'

export const MONITORING_WINDOW_OPTIONS: Array<{
  value: MonitoringWindow
  label: string
  summaryLabel: string
}> = [
  { value: '15m', label: '15m', summaryLabel: '最近 15 分钟' },
  { value: '1h', label: '1h', summaryLabel: '最近 1 小时' },
  { value: '24h', label: '24h', summaryLabel: '最近 24 小时' },
]

const numberFormatter = new Intl.NumberFormat('zh-CN')

export function getMonitoringWindowSummaryLabel(window: MonitoringWindow): string {
  return (
    MONITORING_WINDOW_OPTIONS.find((option) => option.value === window)?.summaryLabel ??
    '当前窗口'
  )
}

export function formatMonitoringCount(value: number): string {
  return numberFormatter.format(value)
}

export function formatMonitoringPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function formatMonitoringDuration(value: number | null): string {
  if (value == null) {
    return '—'
  }

  if (value >= 60_000) {
    return `${(value / 60_000).toFixed(1)} 分钟`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)} 秒`
  }

  return `${Math.round(value)} 毫秒`
}

export function formatMonitoringTimestamp(value?: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function getAlertSeverityLabel(severity: MonitoringAlertSeverity): string {
  switch (severity) {
    case 'critical':
      return '高风险'
    case 'warning':
      return '警告'
    default:
      return '提示'
  }
}

export function getAlertCategoryLabel(category: MonitoringAlertCategory): string {
  switch (category) {
    case 'error-rate':
      return '失败率'
    case 'queue-depth':
      return '排队深度'
    case 'governance-block':
      return '治理阻止'
    case 'anomalous-execution':
      return '异常执行'
  }
}

export function getRiskLevelLabel(level: MonitoringRiskLevel): string {
  switch (level) {
    case 'critical':
      return '关键风险'
    case 'warning':
      return '风险抬升'
    default:
      return '运行稳定'
  }
}

export function getHotspotKindLabel(kind: MonitoringHotspotKind): string {
  return kind === 'workflow' ? '工作流热点' : '执行热点'
}

export function getHotspotStatusLabel(status: MonitoringHotspotStatus): string {
  switch (status) {
    case 'governance-paused':
      return '治理暂停'
    case 'paused':
      return 'execution paused（人工介入）'
    case 'blocked':
      return '治理阻止'
    case 'failed':
      return '失败高发'
    case 'running':
      return '运行中'
    default:
      return '稳定'
  }
}

export function getMetricSourceLabel(source: MonitoringMetricSource): string {
  switch (source) {
    case 'execution-records':
      return 'execution records'
    case 'workflow-executions':
      return 'workflow executions'
    case 'resource-governance':
      return 'resource governance'
    case 'notifications':
      return 'notifications'
    case 'audit-logs':
      return 'audit logs'
    case 'execution-queue':
      return 'execution queue'
    case 'derived':
      return 'derived'
  }
}

export function getMonitoringLinkLabel(target?: MonitoringLinkTarget): string | null {
  if (!target) {
    return null
  }

  return target.type === 'resource-governance' ? '前往资源治理设置' : '查看执行详情'
}

export function isMonitoringDashboardEmpty(dashboard: MonitoringDashboard): boolean {
  return (
    dashboard.summary.executionCount === 0 &&
    dashboard.summary.activeAlerts === 0 &&
    dashboard.summary.governanceBlocks === 0 &&
    dashboard.trend.length === 0 &&
    dashboard.alerts.length === 0 &&
    dashboard.hotspots.length === 0
  )
}
