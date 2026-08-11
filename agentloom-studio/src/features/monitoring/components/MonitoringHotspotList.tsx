import { ExternalLink, Flame } from 'lucide-react'
import { motion } from 'motion/react'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { staggerList } from '@/shared/lib/motion'
import { Badge, type BadgeProps } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import {
  formatMonitoringCount,
  formatMonitoringPercent,
  formatMonitoringTimestamp,
  getHotspotKindLabel,
  getHotspotStatusLabel,
  getMonitoringLinkLabel,
} from '../lib/monitoring'
import type { MonitoringHotspot, MonitoringHotspotStatus } from '../types/monitoring'

interface MonitoringHotspotListProps {
  hotspots: MonitoringHotspot[]
}

const STATUS_VARIANT: Record<MonitoringHotspotStatus, BadgeProps['variant']> = {
  healthy: 'success',
  running: 'info',
  failed: 'error',
  paused: 'default',
  'governance-paused': 'warning',
  blocked: 'warning',
}

export function MonitoringHotspotList({ hotspots }: MonitoringHotspotListProps) {
  return (
    <Card data-testid="monitoring-hotspots">
      <CardHeader>
        <CardTitle>热点工作流与异常执行</CardTitle>
        <p className="text-xs leading-relaxed text-muted">
          这里只统计当前组织内部的热点对象，不是跨租户总榜。治理暂停与 execution paused（人工介入）会用不同标签显示。
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {hotspots.length === 0 ? (
          <EmptyState
            icon={Flame}
            title="当前窗口内没有需要优先关注的热点对象。"
            description="切换到更长的时间窗口可以纳入更早的异常执行。"
            tone="var(--color-success)"
            className="py-8"
          />
        ) : (
          hotspots.map((hotspot, index) => {
            const linkLabel = getMonitoringLinkLabel(hotspot.linkTarget)

            return (
              <motion.article
                key={hotspot.id}
                {...staggerList(index)}
                className="rounded-card border border-border bg-surface-elevated p-3"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-xs font-semibold text-foreground">{hotspot.label}</h3>
                      <Badge variant="outline" size="sm">
                        {getHotspotKindLabel(hotspot.kind)}
                      </Badge>
                      <Badge variant={STATUS_VARIANT[hotspot.status] ?? 'secondary'} size="sm">
                        {getHotspotStatusLabel(hotspot.status)}
                      </Badge>
                    </div>
                    <p className="text-xs leading-relaxed text-muted">{hotspot.impactSummary}</p>
                  </div>

                  <span className="shrink-0 text-[11px] text-muted">
                    最近出现：{formatMonitoringTimestamp(hotspot.lastSeenAt)}
                  </span>
                </div>

                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-card border border-border bg-surface p-2.5">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                      执行量
                    </dt>
                    <dd className="mt-1.5 text-xs font-medium tabular-nums text-foreground">
                      {formatMonitoringCount(hotspot.executionCount)}
                    </dd>
                  </div>
                  <div className="rounded-card border border-border bg-surface p-2.5">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                      失败率
                    </dt>
                    <dd className="mt-1.5 text-xs font-medium tabular-nums text-foreground">
                      {hotspot.failureRate == null
                        ? '—'
                        : formatMonitoringPercent(hotspot.failureRate)}
                    </dd>
                  </div>
                  <div className="rounded-card border border-border bg-surface p-2.5">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                      排队深度
                    </dt>
                    <dd className="mt-1.5 text-xs font-medium tabular-nums text-foreground">
                      {hotspot.queueDepth == null ? '—' : formatMonitoringCount(hotspot.queueDepth)}
                    </dd>
                  </div>
                </dl>

                {hotspot.linkTarget && linkLabel ? (
                  <a
                    href={hotspot.linkTarget.href}
                    className="mt-3 inline-flex items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
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
  )
}
