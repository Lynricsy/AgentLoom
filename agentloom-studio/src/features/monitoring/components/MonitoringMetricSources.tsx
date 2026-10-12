import { Database } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
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
    <Card data-testid="monitoring-metric-sources">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle>指标来源说明</CardTitle>
        </div>
        <CardDescription className="leading-relaxed">
          第一版监控只展示当前仓库里已经可验证的应用内事实源，不会把规划中的 Prometheus 或 Grafana 说成现状。
        </CardDescription>
        <CardDescription className="leading-relaxed">
          其中队列深度来自当前 <code className="rounded-xs bg-muted px-1 font-mono">agent-task</code> queue snapshot，只反映此刻积压与活跃作业；第一版不会把它伪装成跨窗口的历史队列曲线。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {SOURCE_GROUPS.map((group) => (
          <div key={group.key} className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {sources[group.key].map((source) => (
                <Badge key={`${group.key}-${source}`} variant="secondary" size="sm">
                  {getMetricSourceLabel(source)}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
