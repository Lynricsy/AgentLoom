import { useState } from 'react'
import { AlertTriangle, Loader2, RadioTower, ShieldAlert } from 'lucide-react'
import { useAuthToken } from '@/features/execution'
import {
  canManageResourceGovernance,
  getResourceGovernanceOrganizationIdFromToken,
  getResourceGovernanceRoleFromToken,
} from '@/features/resource-governance'
import { Button } from '@/shared/ui/button'
import { useMonitoringDashboard } from '../hooks/useMonitoringDashboard'
import {
  DEFAULT_MONITORING_WINDOW,
  MONITORING_WINDOW_OPTIONS,
  formatMonitoringTimestamp,
  getMonitoringWindowSummaryLabel,
  isMonitoringDashboardEmpty,
} from '../lib/monitoring'
import type { MonitoringWindow } from '../types/monitoring'
import { MonitoringAlertList } from '../components/MonitoringAlertList'
import { MonitoringHotspotList } from '../components/MonitoringHotspotList'
import { MonitoringMetricSources } from '../components/MonitoringMetricSources'
import { MonitoringSummaryCards } from '../components/MonitoringSummaryCards'
import { MonitoringTrendChart } from '../components/MonitoringTrendChart'

function getForbiddenMessage(authToken?: string, role?: string | null) {
  if (!authToken || !role) {
    return '当前未识别到可查看监控仪表板的组织身份，请使用 owner 或 admin 角色重新登录。'
  }

  return `当前组织角色为 ${role}，只有 owner 或 admin 可以查看当前组织的监控仪表板。`
}

function MonitoringForbiddenState({
  authToken,
  role,
}: {
  authToken?: string
  role?: string | null
}) {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="monitoring-forbidden">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">运行监控</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          这里只展示当前组织内部的全局运行视图。治理暂停只会阻止新的执行进入，不等同于
          execution paused（人工介入）。
        </p>
      </div>

      <section className="rounded-2xl border border-amber-500/30 bg-surface-elevated p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-amber-500/10 p-2 text-amber-300">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">无权访问监控仪表板</h2>
            <p className="text-sm text-muted-foreground">{getForbiddenMessage(authToken, role)}</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function MonitoringMissingOrgState() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="monitoring-missing-org">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">运行监控</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          这里只展示当前组织内部的全局运行视图。治理暂停只会阻止新的执行进入，不等同于
          execution paused（人工介入）。
        </p>
      </div>

      <section className="rounded-2xl border border-amber-500/30 bg-surface-elevated p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-amber-500/10 p-2 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">无法识别当前组织</h2>
            <p className="text-sm text-muted-foreground">
              当前登录令牌里没有可用的 organizationId / orgId / tenantId 信息，暂时无法加载监控仪表板。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function MonitoringDashboardContent({ organizationId }: { organizationId: string }) {
  const [window, setWindow] = useState<MonitoringWindow>(DEFAULT_MONITORING_WINDOW)
  const { data, isLoading, isError, error, isFetching } = useMonitoringDashboard(
    organizationId,
    window,
  )

  const activeWindowLabel = getMonitoringWindowSummaryLabel(window)

  return (
    <div className="h-full overflow-auto" data-testid="monitoring-page">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">运行监控</h1>
            <p className="max-w-4xl text-sm text-muted-foreground">
              查看当前组织范围内的执行量、成功率、失败率、平均耗时、队列压力、治理阻止与热点分布。这里是只读监控页，不提供配额修改、治理暂停切换或异常执行终止。
            </p>
            <p className="max-w-4xl text-sm text-muted-foreground">
              治理暂停只会阻止新的执行进入，不等同于 execution paused（人工介入）。如需处置，请跳转到既有治理或执行详情入口。
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
            <span className="rounded-full border border-border px-3 py-1.5">仅 owner / admin 可访问</span>
            <span className="rounded-full border border-border px-3 py-1.5">只读监控</span>
          </div>
        </div>

        <section
          className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
          data-testid="monitoring-toolbar"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <RadioTower className="h-4 w-4" aria-hidden="true" />
                <h2 className="text-lg font-semibold">当前组织全局视图</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                当前窗口：{activeWindowLabel} · 组织范围：organization · 最近刷新：
                {formatMonitoringTimestamp(data?.summary.lastUpdatedAt)}
              </p>
              <p className="text-xs text-muted-foreground">
                {isFetching && !isLoading
                  ? `正在按 ${activeWindowLabel} 重新刷新摘要、趋势、告警与热点数据…`
                  : '切换时间窗口会触发新的查询，请避免把不同窗口下的数据混读。'}
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 xl:items-end">
              <div role="group" aria-label="监控时间窗口" className="flex flex-wrap gap-2">
                {MONITORING_WINDOW_OPTIONS.map((option) => {
                  const isActive = option.value === window

                  return (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={isActive ? 'default' : 'outline'}
                      aria-pressed={isActive}
                      data-testid={`monitoring-window-${option.value}`}
                      onClick={() => setWindow(option.value)}
                    >
                      {option.label}
                    </Button>
                  )
                })}
              </div>

              <a
                href="/settings/resource-quotas"
                className="text-sm font-medium text-primary transition-colors hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                前往资源治理设置
              </a>
            </div>
          </div>
        </section>

        {isLoading ? (
          <section
            className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm"
            data-testid="monitoring-loading-state"
          >
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              正在加载监控数据…
            </div>
          </section>
        ) : null}

        {!isLoading && (isError || !data) ? (
          <section
            className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 shadow-sm"
            data-testid="monitoring-error-state"
          >
            <p className="text-sm font-medium text-foreground">加载监控数据失败</p>
            <p className="mt-1 text-sm text-rose-200">
              {error instanceof Error ? error.message : '未知错误'}
            </p>
          </section>
        ) : null}

        {!isLoading && !isError && data && isMonitoringDashboardEmpty(data) ? (
          <section
            className="rounded-2xl border border-dashed border-border bg-surface-elevated p-6 shadow-sm"
            data-testid="monitoring-empty-state"
          >
            <h2 className="text-lg font-semibold text-foreground">当前窗口内暂无运行活动</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {activeWindowLabel} 内还没有可展示的执行趋势、告警或热点对象。你可以切换到更长的窗口，或前往资源治理页查看当前治理状态。
            </p>
          </section>
        ) : null}

        {!isLoading && !isError && data && !isMonitoringDashboardEmpty(data) ? (
          <>
            <MonitoringSummaryCards summary={data.summary} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <MonitoringTrendChart trend={data.trend} activeWindowLabel={activeWindowLabel} />
              <div className="space-y-6">
                <MonitoringAlertList alerts={data.alerts} riskSummary={data.riskSummary} />
                <MonitoringMetricSources sources={data.summary.metricSources} />
              </div>
            </div>

            <MonitoringHotspotList hotspots={data.hotspots} />
          </>
        ) : null}
      </div>
    </div>
  )
}

export function MonitoringDashboardPage() {
  const authToken = useAuthToken()
  const currentUserRole = getResourceGovernanceRoleFromToken(authToken)
  const organizationId = getResourceGovernanceOrganizationIdFromToken(authToken)

  if (!canManageResourceGovernance(currentUserRole)) {
    return <MonitoringForbiddenState authToken={authToken} role={currentUserRole} />
  }

  if (!organizationId) {
    return <MonitoringMissingOrgState />
  }

  return <MonitoringDashboardContent organizationId={organizationId} />
}
