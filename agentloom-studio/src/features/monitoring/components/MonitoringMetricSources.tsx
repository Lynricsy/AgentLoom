import { Database } from 'lucide-react'
import { getMetricSourceLabel } from '../lib/monitoring'
import type { MonitoringMetricSources as MonitoringMetricSourcesData } from '../types/monitoring'

interface MonitoringMetricSourcesProps {
  sources: MonitoringMetricSourcesData
}

const SOURCE_GROUPS: Array<{
  key: keyof MonitoringMetricSourcesData
  label: string
}> = [
  { key: 'execution', label: '执行摘要来源' },
  { key: 'governance', label: '治理摘要来源' },
  { key: 'alerts', label: '告警来源' },
  { key: 'queueDepth', label: '队列深度来源' },
]

export function MonitoringMetricSources({ sources }: MonitoringMetricSourcesProps) {
  return (
    <section
      className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm"
      data-testid="monitoring-metric-sources"
    >
      <div className="flex items-center gap-2 text-foreground">
        <Database className="h-4 w-4" aria-hidden="true" />
        <h2 className="text-lg font-semibold">指标来源说明</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        第一版监控只展示当前仓库里已经可验证的应用内事实源，不会把规划中的 Prometheus 或 Grafana 说成现状。
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        其中队列深度来自当前 `agent-task` queue snapshot，只反映此刻积压与活跃作业；第一版不会把它伪装成跨窗口的历史队列曲线。
      </p>

      <div className="mt-5 space-y-4">
        {SOURCE_GROUPS.map((group) => (
          <div key={group.key} className="space-y-2">
            <p className="text-sm font-medium text-foreground">{group.label}</p>
            <div className="flex flex-wrap gap-2">
              {sources[group.key].map((source) => (
                <span
                  key={`${group.key}-${source}`}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {getMetricSourceLabel(source)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
