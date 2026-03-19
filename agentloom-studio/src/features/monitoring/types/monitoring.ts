export type MonitoringWindow = '15m' | '1h' | '24h'

export type MonitoringScope = 'organization'

export type MonitoringMetricSource =
  | 'execution-records'
  | 'workflow-executions'
  | 'resource-governance'
  | 'notifications'
  | 'audit-logs'
  | 'execution-queue'
  | 'derived'

export interface MonitoringMetricSources {
  execution: MonitoringMetricSource[]
  governance: MonitoringMetricSource[]
  alerts: MonitoringMetricSource[]
  queueDepth: MonitoringMetricSource[]
}

export interface MonitoringDashboardSummary {
  scope: MonitoringScope
  window: MonitoringWindow
  lastUpdatedAt: string
  executionCount: number
  successRate: number
  failureRate: number
  averageDurationMs: number | null
  queueDepth: number
  governanceBlocks: number
  activeAlerts: number
  metricSources: MonitoringMetricSources
}

export interface MonitoringTrendPoint {
  bucketStart: string
  bucketLabel: string
  executionCount: number
  successRate: number
  failureRate: number
  averageDurationMs: number | null
  queueDepth: number | null
  governanceBlocks: number
  activeAlerts: number
}

export type MonitoringLinkTarget =
  | {
      type: 'resource-governance'
      href: '/settings/resource-quotas'
    }
  | {
      type: 'execution'
      href: `/executions/${string}`
    }

export type MonitoringAlertSeverity = 'info' | 'warning' | 'critical'

export type MonitoringAlertCategory =
  | 'error-rate'
  | 'queue-depth'
  | 'governance-block'
  | 'anomalous-execution'

export interface MonitoringAlertSummary {
  id: string
  severity: MonitoringAlertSeverity
  category: MonitoringAlertCategory
  title: string
  reason: string
  detectedAt: string
  affectedSummary: string
  source: MonitoringMetricSource
  linkTarget?: MonitoringLinkTarget
}

export type MonitoringHotspotKind = 'workflow' | 'execution'

export type MonitoringHotspotStatus =
  | 'healthy'
  | 'running'
  | 'failed'
  | 'paused'
  | 'governance-paused'
  | 'blocked'

export interface MonitoringHotspot {
  id: string
  kind: MonitoringHotspotKind
  label: string
  impactSummary: string
  executionCount: number
  failureRate: number | null
  queueDepth: number | null
  status: MonitoringHotspotStatus
  lastSeenAt: string
  linkTarget?: MonitoringLinkTarget
}

export type MonitoringRiskLevel = 'stable' | 'warning' | 'critical'

export interface MonitoringRiskSummary {
  level: MonitoringRiskLevel
  title: string
  summary: string
  explanation: string
  governancePauseActive: boolean
  lastEvaluatedAt: string
  primaryLinkTarget?: MonitoringLinkTarget
}

export interface MonitoringDashboard {
  summary: MonitoringDashboardSummary
  trend: MonitoringTrendPoint[]
  alerts: MonitoringAlertSummary[]
  hotspots: MonitoringHotspot[]
  riskSummary: MonitoringRiskSummary
}
