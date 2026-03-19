import { ExternalLink, Flame } from 'lucide-react'
import {
  formatMonitoringCount,
  formatMonitoringPercent,
  formatMonitoringTimestamp,
  getHotspotKindLabel,
  getHotspotStatusClassName,
  getHotspotStatusLabel,
  getMonitoringLinkLabel,
} from '../lib/monitoring'
import type { MonitoringHotspot } from '../types/monitoring'

interface MonitoringHotspotListProps {
  hotspots: MonitoringHotspot[]
}

export function MonitoringHotspotList({ hotspots }: MonitoringHotspotListProps) {
  return (
    <section
      className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
      data-testid="monitoring-hotspots"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">热点工作流与异常执行</h2>
        <p className="text-sm text-muted-foreground">
          这里只统计当前组织内部的热点对象，不是跨租户总榜。治理暂停与 execution paused（人工介入）会用不同标签显示。
        </p>
      </div>

      {hotspots.length === 0 ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-border/60 bg-background/20 p-4 text-sm text-muted-foreground">
          <Flame className="h-4 w-4" aria-hidden="true" />
          当前窗口内没有需要优先关注的热点对象。
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {hotspots.map((hotspot) => {
            const linkLabel = getMonitoringLinkLabel(hotspot.linkTarget)

            return (
              <article
                key={hotspot.id}
                className="rounded-xl border border-border/60 bg-background/30 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{hotspot.label}</h3>
                      <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                        {getHotspotKindLabel(hotspot.kind)}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getHotspotStatusClassName(
                          hotspot.status,
                        )}`}
                      >
                        {getHotspotStatusLabel(hotspot.status)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{hotspot.impactSummary}</p>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    最近出现：{formatMonitoringTimestamp(hotspot.lastSeenAt)}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-surface-elevated/70 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">执行量</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {formatMonitoringCount(hotspot.executionCount)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-surface-elevated/70 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">失败率</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {hotspot.failureRate == null
                        ? '—'
                        : formatMonitoringPercent(hotspot.failureRate)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-surface-elevated/70 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">排队深度</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {hotspot.queueDepth == null ? '—' : formatMonitoringCount(hotspot.queueDepth)}
                    </p>
                  </div>
                </div>

                {hotspot.linkTarget && linkLabel ? (
                  <a
                    href={hotspot.linkTarget.href}
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
  )
}
