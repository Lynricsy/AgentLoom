/**
 * 监控看板类型：全部来自 `@agentloom/api-client` 生成模型
 * （server OpenAPI `MonitoringDashboardEnvelopeDto`），本文件只做本地命名。
 * 生成模型手改无效，字段/枚举变更请改 server DTO 后重新生成。
 */
import type {
  MonitoringDashboardEnvelopeDtoData,
  MonitoringDashboardEnvelopeDtoDataAlertsInner,
  MonitoringDashboardEnvelopeDtoDataAlertsInnerCategoryEnum,
  MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf,
  MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1,
  MonitoringDashboardEnvelopeDtoDataAlertsInnerSeverityEnum,
  MonitoringDashboardEnvelopeDtoDataAlertsInnerSourceEnum,
  MonitoringDashboardEnvelopeDtoDataHotspotsInner,
  MonitoringDashboardEnvelopeDtoDataHotspotsInnerKindEnum,
  MonitoringDashboardEnvelopeDtoDataHotspotsInnerStatusEnum,
  MonitoringDashboardEnvelopeDtoDataRiskSummary,
  MonitoringDashboardEnvelopeDtoDataRiskSummaryLevelEnum,
  MonitoringDashboardEnvelopeDtoDataSummary,
  MonitoringDashboardEnvelopeDtoDataSummaryMetricSources,
  MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesExecutionEnum,
  MonitoringDashboardEnvelopeDtoDataSummaryScopeEnum,
  MonitoringDashboardEnvelopeDtoDataSummaryWindowEnum,
  MonitoringDashboardEnvelopeDtoDataTrendInner,
} from '@agentloom/api-client'

export type MonitoringWindow = MonitoringDashboardEnvelopeDtoDataSummaryWindowEnum

export type MonitoringScope = MonitoringDashboardEnvelopeDtoDataSummaryScopeEnum

export type MonitoringMetricSource =
  MonitoringDashboardEnvelopeDtoDataSummaryMetricSourcesExecutionEnum

export type MonitoringMetricSources = MonitoringDashboardEnvelopeDtoDataSummaryMetricSources

export type MonitoringDashboardSummary = MonitoringDashboardEnvelopeDtoDataSummary

export type MonitoringTrendPoint = MonitoringDashboardEnvelopeDtoDataTrendInner

/**
 * 跳转目标保持判别联合：生成器把 server 的 anyOf 摊平成了
 * `{ type: 'resource-governance' | 'execution'; href: string }`，
 * 摊平结果会放过 `type: 'execution' + 治理配额 href` 这类非法组合。
 * 这里直接组合两个 AnyOf 分支，既用生成类型也保留判别能力。
 */
export type MonitoringLinkTarget =
  | MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf
  | MonitoringDashboardEnvelopeDtoDataAlertsInnerLinkTargetAnyOf1

export type MonitoringAlertSeverity = MonitoringDashboardEnvelopeDtoDataAlertsInnerSeverityEnum

export type MonitoringAlertCategory = MonitoringDashboardEnvelopeDtoDataAlertsInnerCategoryEnum

export type MonitoringAlertSource = MonitoringDashboardEnvelopeDtoDataAlertsInnerSourceEnum

export type MonitoringAlertSummary = Omit<
  MonitoringDashboardEnvelopeDtoDataAlertsInner,
  'linkTarget'
> & {
  linkTarget?: MonitoringLinkTarget
}

export type MonitoringHotspotKind = MonitoringDashboardEnvelopeDtoDataHotspotsInnerKindEnum

export type MonitoringHotspotStatus = MonitoringDashboardEnvelopeDtoDataHotspotsInnerStatusEnum

export type MonitoringHotspot = Omit<
  MonitoringDashboardEnvelopeDtoDataHotspotsInner,
  'linkTarget'
> & {
  linkTarget?: MonitoringLinkTarget
}

export type MonitoringRiskLevel = MonitoringDashboardEnvelopeDtoDataRiskSummaryLevelEnum

export type MonitoringRiskSummary = Omit<
  MonitoringDashboardEnvelopeDtoDataRiskSummary,
  'primaryLinkTarget'
> & {
  primaryLinkTarget?: MonitoringLinkTarget
}

export type MonitoringDashboard = Omit<
  MonitoringDashboardEnvelopeDtoData,
  'summary' | 'trend' | 'alerts' | 'hotspots' | 'riskSummary'
> & {
  summary: MonitoringDashboardSummary
  trend: MonitoringTrendPoint[]
  alerts: MonitoringAlertSummary[]
  hotspots: MonitoringHotspot[]
  riskSummary: MonitoringRiskSummary
}
