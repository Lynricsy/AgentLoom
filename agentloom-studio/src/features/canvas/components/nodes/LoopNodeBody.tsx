import { memo } from 'react'
import { Repeat } from 'lucide-react'
import { NodeBadge } from '../shared/NodeBadge'

function resolveOutputMode(config: Record<string, unknown>): string {
  return config.outputMode === 'none'
    || config.outputMode === 'collect-array'
    || config.outputMode === 'last'
    ? config.outputMode
    : 'last'
}

export const LoopNodeBody = memo(function LoopNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const outputMode = resolveOutputMode(config)
  const isCollapsed = config.isCollapsed === true

  return (
    <div className="flex flex-col gap-2" data-testid="loop-node-body">
      <div className="flex items-center gap-1.5">
        <Repeat className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-2xs font-medium text-foreground">循环容器</span>
        <span className="text-2xs text-subtle-foreground">
          {isCollapsed ? '已收起' : '默认展开'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <NodeBadge className="border border-border/50 font-normal">
          输出: {outputMode}
        </NodeBadge>
        <NodeBadge className="border border-border/50 font-normal">
          支持 loop-state / result
        </NodeBadge>
      </div>
    </div>
  )
})
