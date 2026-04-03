import { memo } from 'react'
import { Repeat } from 'lucide-react'

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
        <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] font-medium text-foreground">循环容器</span>
        <span className="text-[10px] text-muted-foreground/70">
          {isCollapsed ? '已收起' : '默认展开'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <span className="rounded border border-border/50 bg-muted/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          输出: {outputMode}
        </span>
        <span className="rounded border border-border/50 bg-muted/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          支持 loop-state / result
        </span>
      </div>
    </div>
  )
})
