import { memo, useMemo } from 'react'
import {
  Shuffle,
  RefreshCw,
  ListChecks,
  Brain,
  ArrowDownUp,
  ScatterChart,
  Network,
  Trophy,
  Database,
  Puzzle,
} from 'lucide-react'
import type { SmartRoutingNodeData } from '../../types'
import {
  STRATEGY_META,
  STRATEGY_CATEGORY_COLORS,
  STRATEGY_CATEGORY_BG,
  useHealthStatus,
} from '@/features/smart-routing'
import type { StrategyName, ProviderHealthStatus } from '@/features/smart-routing'
import { cn } from '@/shared/lib/utils'
import { usePreviewMode } from '../PreviewModeContext'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shuffle,
  RefreshCw,
  ListChecks,
  Brain,
  ArrowDownUp,
  ScatterChart,
  Network,
  Trophy,
  Database,
  Puzzle,
}

const HEALTH_DOT_COLORS: Record<ProviderHealthStatus, string> = {
  healthy: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  open: 'bg-red-400',
}

interface SmartRoutingNodeBodyProps {
  data: SmartRoutingNodeData
  connectedModelCount?: number
}

export const SmartRoutingNodeBody = memo(function SmartRoutingNodeBody({
  data,
  connectedModelCount,
}: SmartRoutingNodeBodyProps) {
  const meta = STRATEGY_META[data.strategy as StrategyName]
  const strategyLabel = meta?.displayName ?? data.strategy ?? '未配置'
  const modelCount = connectedModelCount ?? data.modelConfigIds?.length ?? 0
  const category = meta?.category ?? 'simple'

  // 预览态（含匿名公开分享页）不得触发受保护的 health 查询
  const previewMode = usePreviewMode()
  const { data: healthData } = useHealthStatus(!previewMode)
  const healthSummary = useMemo(() => {
    const counts: Record<ProviderHealthStatus, number> = { healthy: 0, degraded: 0, open: 0 }
    for (const h of healthData ?? []) {
      counts[h.status]++
    }
    return counts
  }, [healthData])

  const Icon = meta?.icon ? ICON_MAP[meta.icon] : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {Icon ? (
          <Icon className={cn('h-3.5 w-3.5 shrink-0', STRATEGY_CATEGORY_COLORS[category])} />
        ) : null}
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
            STRATEGY_CATEGORY_BG[category],
            STRATEGY_CATEGORY_COLORS[category],
          )}
        >
          {strategyLabel}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{modelCount} 个模型</p>
        {healthData && healthData.length > 0 ? (
          <div className="flex items-center gap-1" data-testid="provider-health-summary">
            {(Object.entries(healthSummary) as [ProviderHealthStatus, number][]).map(
              ([status, count]) =>
                count > 0 ? (
                  <span
                    key={status}
                    className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                    data-testid={`provider-health-badge-${status}`}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', HEALTH_DOT_COLORS[status])} />
                    {count}
                  </span>
                ) : null,
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
})
