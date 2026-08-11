import { AlertTriangle, ExternalLink, ShieldAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { staggerList } from '@/shared/lib/motion'
import { Badge, type BadgeProps } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import {
  formatMonitoringTimestamp,
  getAlertCategoryLabel,
  getAlertSeverityLabel,
  getMonitoringLinkLabel,
  getRiskLevelLabel,
} from '../lib/monitoring'
import type {
  MonitoringAlertSeverity,
  MonitoringAlertSummary,
  MonitoringRiskLevel,
  MonitoringRiskSummary,
} from '../types/monitoring'

interface MonitoringAlertListProps {
  alerts: MonitoringAlertSummary[]
  riskSummary: MonitoringRiskSummary
}

const SEVERITY_VARIANT: Record<MonitoringAlertSeverity, BadgeProps['variant']> = {
  critical: 'error',
  warning: 'warning',
  info: 'info',
}

const RISK_VARIANT: Record<MonitoringRiskLevel, BadgeProps['variant']> = {
  critical: 'error',
  warning: 'warning',
  stable: 'success',
}

const DRILL_DOWN_LINK_CLASS =
  'inline-flex items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'

export function MonitoringAlertList({
  alerts,
  riskSummary,
}: MonitoringAlertListProps) {
  const primaryRiskLinkLabel = getMonitoringLinkLabel(riskSummary.primaryLinkTarget)

  return (
    <div className="space-y-4">
      <Card data-testid="monitoring-risk-summary">
        <CardContent className="flex items-start gap-3 p-4">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-card bg-surface-elevated text-muted"
          >
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>风险摘要</CardTitle>
              <Badge variant={RISK_VARIANT[riskSummary.level] ?? 'secondary'} size="sm">
                {getRiskLevelLabel(riskSummary.level)}
              </Badge>
            </div>
            <p className="text-xs font-medium text-foreground">{riskSummary.title}</p>
            <p className="text-xs leading-relaxed text-muted">{riskSummary.summary}</p>
            <p className="text-xs leading-relaxed text-muted">{riskSummary.explanation}</p>
            <p className="text-[11px] text-muted">
              最近评估时间：{formatMonitoringTimestamp(riskSummary.lastEvaluatedAt)}
            </p>
            <p className="text-[11px] leading-relaxed text-muted">
              {riskSummary.governancePauseActive
                ? '当前存在治理暂停信号。治理暂停只会阻止新的执行进入，不等同于 execution paused（人工介入）。'
                : '当前未检测到租户级治理暂停，但 execution paused（人工介入）仍会在热点列表中单独标识。'}
            </p>
            {riskSummary.primaryLinkTarget && primaryRiskLinkLabel ? (
              <a href={riskSummary.primaryLinkTarget.href} className={DRILL_DOWN_LINK_CLASS}>
                {primaryRiskLinkLabel}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="monitoring-alert-list">
        <CardHeader>
          <CardTitle>告警与治理提示</CardTitle>
          <p className="text-xs leading-relaxed text-muted">
            所有告警都保持只读，仅提供原因说明与 drill-down 入口，不会在这里直接执行配额修改、治理暂停切换或异常执行终止。
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          {alerts.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="当前窗口内没有新的告警项。"
              description="切换到更长的时间窗口可以覆盖更早的告警。"
              tone="var(--color-success)"
              className="py-8"
            />
          ) : (
            alerts.map((alert, index) => {
              const linkLabel = getMonitoringLinkLabel(alert.linkTarget)

              return (
                <motion.article
                  key={alert.id}
                  {...staggerList(index)}
                  className="rounded-card border border-border bg-surface-elevated p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-xs font-semibold text-foreground">{alert.title}</h3>
                        <Badge variant={SEVERITY_VARIANT[alert.severity] ?? 'secondary'} size="sm">
                          {getAlertSeverityLabel(alert.severity)}
                        </Badge>
                        <Badge variant="outline" size="sm">
                          {getAlertCategoryLabel(alert.category)}
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-muted">{alert.reason}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted">
                      触发时间：{formatMonitoringTimestamp(alert.detectedAt)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" size="sm">
                      影响：{alert.affectedSummary}
                    </Badge>
                    <Badge variant="secondary" size="sm">
                      来源：{alert.source}
                    </Badge>
                  </div>

                  {alert.linkTarget && linkLabel ? (
                    <a href={alert.linkTarget.href} className={`mt-3 ${DRILL_DOWN_LINK_CLASS}`}>
                      {linkLabel}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : null}
                </motion.article>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
