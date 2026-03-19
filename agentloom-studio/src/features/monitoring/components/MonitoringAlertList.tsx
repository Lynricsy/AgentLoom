import { AlertTriangle, ExternalLink, ShieldAlert } from 'lucide-react'
import {
  formatMonitoringTimestamp,
  getAlertCategoryLabel,
  getAlertSeverityClassName,
  getAlertSeverityLabel,
  getMonitoringLinkLabel,
  getRiskLevelClassName,
  getRiskLevelLabel,
} from '../lib/monitoring'
import type {
  MonitoringAlertSummary,
  MonitoringRiskSummary,
} from '../types/monitoring'

interface MonitoringAlertListProps {
  alerts: MonitoringAlertSummary[]
  riskSummary: MonitoringRiskSummary
}

export function MonitoringAlertList({
  alerts,
  riskSummary,
}: MonitoringAlertListProps) {
  const primaryRiskLinkLabel = getMonitoringLinkLabel(riskSummary.primaryLinkTarget)

  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
        data-testid="monitoring-risk-summary"
      >
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-background/60 p-2 text-muted-foreground">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">风险摘要</h2>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getRiskLevelClassName(
                  riskSummary.level,
                )}`}
              >
                {getRiskLevelLabel(riskSummary.level)}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">{riskSummary.title}</p>
            <p className="text-sm text-muted-foreground">{riskSummary.summary}</p>
            <p className="text-sm text-muted-foreground">{riskSummary.explanation}</p>
            <p className="text-xs text-muted-foreground">
              最近评估时间：{formatMonitoringTimestamp(riskSummary.lastEvaluatedAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              {riskSummary.governancePauseActive
                ? '当前存在治理暂停信号。治理暂停只会阻止新的执行进入，不等同于 execution paused（人工介入）。'
                : '当前未检测到租户级治理暂停，但 execution paused（人工介入）仍会在热点列表中单独标识。'}
            </p>
            {riskSummary.primaryLinkTarget && primaryRiskLinkLabel ? (
              <a
                href={riskSummary.primaryLinkTarget.href}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {primaryRiskLinkLabel}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
        data-testid="monitoring-alert-list"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">告警与治理提示</h2>
          <p className="text-sm text-muted-foreground">
            所有告警都保持只读，仅提供原因说明与 drill-down 入口，不会在这里直接执行配额修改、治理暂停切换或异常执行终止。
          </p>
        </div>

        {alerts.length === 0 ? (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            当前窗口内没有新的告警项。
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {alerts.map((alert) => {
              const linkLabel = getMonitoringLinkLabel(alert.linkTarget)

              return (
                <article
                  key={alert.id}
                  className="rounded-xl border border-border/60 bg-background/30 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{alert.title}</h3>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getAlertSeverityClassName(
                            alert.severity,
                          )}`}
                        >
                          {getAlertSeverityLabel(alert.severity)}
                        </span>
                        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                          {getAlertCategoryLabel(alert.category)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.reason}</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      触发时间：{formatMonitoringTimestamp(alert.detectedAt)}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border px-2.5 py-1">
                      影响：{alert.affectedSummary}
                    </span>
                    <span className="rounded-full border border-border px-2.5 py-1">
                      来源：{alert.source}
                    </span>
                  </div>

                  {alert.linkTarget && linkLabel ? (
                    <a
                      href={alert.linkTarget.href}
                      className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      {linkLabel}
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
