import { useState } from 'react'
import { Activity, AlertTriangle, RadioTower, ShieldAlert } from 'lucide-react'
import { useAuthToken } from '@/features/execution'
import {
  canManageResourceGovernance,
  getResourceGovernanceOrganizationIdFromToken,
  getResourceGovernanceRoleFromToken,
} from '@/features/resource-governance'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { RoutingDecisionsPanel } from '@/features/routing-decision'
import { OptimizationSuggestionsBoard } from '@/features/optimization-suggestion'
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

const PAGE_DESCRIPTION =
  '这里只展示当前组织内部的全局运行视图。治理暂停只会阻止新的执行进入，不等同于 execution paused（人工介入）。'

function MonitoringBlockedState({
  testId,
  icon: Icon,
  title,
  message,
}: {
  testId: string
  icon: typeof ShieldAlert
  title: string
  message: string
}) {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid={testId}>
      <PageHeader icon={Activity} title="运行监控" description={PAGE_DESCRIPTION} />

      <Card className="border-warning/30">
        <CardContent className="flex items-start gap-3 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-card bg-warning/10 text-warning">
            <Icon className="h-5 w-5" />
          </span>
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs leading-relaxed text-muted">{message}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MonitoringOverviewTab({
  organizationId,
  window,
  onWindowChange,
}: {
  organizationId: string
  window: MonitoringWindow
  onWindowChange: (window: MonitoringWindow) => void
}) {
  const { data, isLoading, isError, error, isFetching } = useMonitoringDashboard(
    organizationId,
    window,
  )

  const activeWindowLabel = getMonitoringWindowSummaryLabel(window)

  return (
    <div className="space-y-6" data-testid="monitoring-overview">
      <Card data-testid="monitoring-toolbar">
        <CardContent className="flex flex-col gap-4 p-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <RadioTower className="h-4 w-4" aria-hidden="true" />
              <h2 className="text-sm font-semibold">当前组织全局视图</h2>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              当前窗口：{activeWindowLabel} · 组织范围：organization · 最近刷新：
              {formatMonitoringTimestamp(data?.summary.lastUpdatedAt)}
            </p>
            <p className="flex items-center gap-1.5 text-xs leading-relaxed text-muted">
              {isFetching && !isLoading ? (
                <>
                  <Spinner className="h-3 w-3" />
                  {`正在按 ${activeWindowLabel} 重新刷新摘要、趋势、告警与热点数据…`}
                </>
              ) : (
                '切换时间窗口会触发新的查询，请避免把不同窗口下的数据混读。'
              )}
            </p>
            <p className="text-xs leading-relaxed text-muted">
              治理暂停只会阻止新的执行进入，不等同于 execution paused（人工介入）。如需处置，请跳转到既有治理或执行详情入口。
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 xl:items-end">
            <div role="group" aria-label="监控时间窗口" className="flex flex-wrap gap-1.5">
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
                    onClick={() => onWindowChange(option.value)}
                  >
                    {option.label}
                  </Button>
                )
              })}
            </div>

            <a
              href="/settings/resource-quotas"
              className="rounded-md text-xs font-medium text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              前往资源治理设置
            </a>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-6" data-testid="monitoring-loading-state">
          <p className="flex items-center gap-2 text-xs text-muted">
            <Spinner className="h-3.5 w-3.5" />
            正在加载监控数据…
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[6.5rem] rounded-card" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Skeleton className="h-80 rounded-card" />
            <Skeleton className="h-80 rounded-card" />
          </div>
        </div>
      ) : null}

      {!isLoading && (isError || !data) ? (
        <Card className="border-error/30" data-testid="monitoring-error-state">
          <CardContent className="space-y-1 p-5">
            <p className="text-sm font-medium text-foreground">加载监控数据失败</p>
            <p className="text-xs font-medium text-error">
              {error instanceof Error ? error.message : '未知错误'}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !isError && data && isMonitoringDashboardEmpty(data) ? (
        <div data-testid="monitoring-empty-state">
          <EmptyState
            icon={Activity}
            title="当前窗口内暂无运行活动"
            description={`${activeWindowLabel} 内还没有可展示的执行趋势、告警或热点对象。你可以切换到更长的窗口，或前往资源治理页查看当前治理状态。`}
          />
        </div>
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
  )
}

function MonitoringDashboardContent({ organizationId }: { organizationId: string }) {
  // 窗口状态提在 Tabs 之上，切走再切回来时不会丢失用户选择
  const [window, setWindow] = useState<MonitoringWindow>(DEFAULT_MONITORING_WINDOW)

  return (
    <div className="h-full overflow-auto" data-testid="monitoring-page">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          icon={Activity}
          title="运行监控"
          description="查看当前组织范围内的执行量、成功率、失败率、平均耗时、队列压力、治理阻止与热点分布。这里是只读监控页，不提供配额修改、治理暂停切换或异常执行终止。"
          actions={
            <>
              <Badge variant="secondary">仅 owner / admin 可访问</Badge>
              <Badge variant="info">只读监控</Badge>
            </>
          }
        />

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" data-testid="monitoring-tab-overview">
              概览
            </TabsTrigger>
            <TabsTrigger value="routing" data-testid="monitoring-tab-routing">
              路由决策
            </TabsTrigger>
            <TabsTrigger value="suggestions" data-testid="monitoring-tab-suggestions">
              优化建议
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <MonitoringOverviewTab
              organizationId={organizationId}
              window={window}
              onWindowChange={setWindow}
            />
          </TabsContent>

          <TabsContent value="routing" data-testid="monitoring-routing-tab">
            <RoutingDecisionsPanel />
          </TabsContent>

          <TabsContent value="suggestions" data-testid="monitoring-suggestions-tab">
            <OptimizationSuggestionsBoard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export function MonitoringDashboardPage() {
  const authToken = useAuthToken()
  const currentUserRole = getResourceGovernanceRoleFromToken(authToken)
  const organizationId = getResourceGovernanceOrganizationIdFromToken(authToken)

  if (!canManageResourceGovernance(currentUserRole)) {
    return (
      <MonitoringBlockedState
        testId="monitoring-forbidden"
        icon={ShieldAlert}
        title="无权访问监控仪表板"
        message={
          !authToken || !currentUserRole
            ? '当前未识别到可查看监控仪表板的组织身份，请使用 owner 或 admin 角色重新登录。'
            : `当前组织角色为 ${currentUserRole}，只有 owner 或 admin 可以查看当前组织的监控仪表板。`
        }
      />
    )
  }

  if (!organizationId) {
    return (
      <MonitoringBlockedState
        testId="monitoring-missing-org"
        icon={AlertTriangle}
        title="无法识别当前组织"
        message="当前登录令牌里没有可用的 organizationId / orgId / tenantId 信息，暂时无法加载监控仪表板。"
      />
    )
  }

  return <MonitoringDashboardContent organizationId={organizationId} />
}
