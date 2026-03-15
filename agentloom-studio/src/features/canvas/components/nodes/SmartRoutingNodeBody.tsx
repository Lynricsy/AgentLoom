import { memo } from 'react'
import { GitFork } from 'lucide-react'
import type { SmartRoutingNodeData } from '../../types'

const STRATEGY_LABELS: Record<string, string> = {
  TOKEN_OPTIMIZED: 'Token 优化',
  COST_OPTIMIZED: '成本优化',
  QUALITY_FIRST: '质量优先',
  LATENCY_FIRST: '延迟优先',
  HISTORICAL_BEST: '历史最佳',
  FALLBACK_CHAIN: '回退链',
}

interface SmartRoutingNodeBodyProps {
  data: SmartRoutingNodeData
}

export const SmartRoutingNodeBody = memo(function SmartRoutingNodeBody({
  data,
}: SmartRoutingNodeBodyProps) {
  const strategyLabel = STRATEGY_LABELS[data.strategy] ?? data.strategy ?? '未配置'
  const modelCount = data.modelConfigIds?.length ?? data.inputPorts?.length ?? 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <GitFork className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          {strategyLabel}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {modelCount} 个模型
      </p>
    </div>
  )
})
