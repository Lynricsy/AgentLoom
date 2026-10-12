import { memo } from 'react'
import { ListOrdered } from 'lucide-react'
import { NodeBadge } from '../shared/NodeBadge'

function resolveOutputMode(config: Record<string, unknown>): string {
  return config.outputMode === 'none'
    || config.outputMode === 'collect-array'
    || config.outputMode === 'last'
    ? config.outputMode
    : 'collect-array'
}

export const IterationNodeBody = memo(function IterationNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const outputMode = resolveOutputMode(config)
  const isCollapsed = config.isCollapsed === true

  return (
    <div className="flex flex-col gap-2" data-testid="iteration-node-body">
      <div className="flex items-center gap-1.5">
        <ListOrdered className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-2xs font-medium text-foreground">迭代容器</span>
        <span className="text-2xs text-subtle-foreground">
          {isCollapsed ? '已收起' : '默认展开'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <NodeBadge className="border border-border/50 font-normal">
          输入: array
        </NodeBadge>
        <NodeBadge className="border border-border/50 font-normal">
          输出: {outputMode}
        </NodeBadge>
      </div>

      <div className="rounded-sm border border-dashed border-border bg-muted px-2 py-2 text-2xs leading-4 text-muted-foreground">
        内部子图通过 <code className="font-mono">iteration-start / result / break / continue</code>{' '}
        显式控制当前 item 的执行与汇总。
      </div>
    </div>
  )
})
