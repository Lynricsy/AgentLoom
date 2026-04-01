import { memo } from 'react'
import { ListOrdered } from 'lucide-react'

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
        <ListOrdered className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] font-medium text-foreground">迭代容器</span>
        <span className="text-[10px] text-muted-foreground/70">
          {isCollapsed ? '已收起' : '默认展开'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <span className="rounded border border-border/50 bg-muted/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          输入: array
        </span>
        <span className="rounded border border-border/50 bg-muted/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          输出: {outputMode}
        </span>
      </div>

      <div className="rounded border border-dashed border-border/60 bg-background/60 px-2 py-2 text-[10px] leading-4 text-muted-foreground">
        内部子图通过 `iteration-start / result / break / continue` 显式控制当前 item 的执行与汇总。
      </div>
    </div>
  )
})
