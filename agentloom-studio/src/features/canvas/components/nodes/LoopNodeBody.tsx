import { memo, useMemo } from 'react'
import { Repeat, StopCircle, AlertTriangle } from 'lucide-react'
import {
  parseLoopNodeConfig,
  formatStopConditionSummary,
  getErrorStrategyLabel,
} from '../../types/condition.types'

const MAX_SUMMARY_LEN = 36

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

export const LoopNodeBody = memo(function LoopNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const parsed = useMemo(() => parseLoopNodeConfig(config), [config])
  const stopSummary = useMemo(() => formatStopConditionSummary(parsed), [parsed])
  const hasStop = parsed.stopConditionMode !== 'none' && stopSummary.length > 0
  const isExpression = parsed.stopConditionMode === 'expression'

  return (
    <div className="flex flex-col gap-1" data-testid="loop-node-body">
      {/* 标题 */}
      <div className="flex items-center gap-1.5">
        <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] font-medium text-foreground">
          循环
        </span>
      </div>

      {/* 基本参数行 */}
      <div className="rounded border border-border/40 bg-muted/10 px-1.5 py-1">
        <span className="text-[10px] text-muted-foreground">
          最大 {parsed.maxIterations} 次
        </span>
      </div>

      {/* 停止条件行 */}
      {hasStop && (
        <div className="flex items-center gap-1 rounded border border-border/40 bg-muted/10 px-1.5 py-1">
          <StopCircle className="h-3 w-3 shrink-0 text-amber-400/80" />
          <span className="text-[10px] text-muted-foreground/60">
            停止:
          </span>
          <span
            className={
              isExpression
                ? 'min-w-0 flex-1 truncate font-mono text-[10px] text-amber-300/80'
                : 'min-w-0 flex-1 truncate text-[10px] text-muted-foreground'
            }
          >
            {truncate(stopSummary, MAX_SUMMARY_LEN)}
          </span>
        </div>
      )}

      {/* 错误策略行 */}
      {parsed.errorStrategy !== 'stop' && (
        <div className="flex items-center gap-1 rounded border border-border/40 bg-muted/10 px-1.5 py-1">
          <AlertTriangle className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          <span className="text-[10px] text-muted-foreground/60">
            出错时:
          </span>
          <span className="text-[10px] text-muted-foreground">
            {getErrorStrategyLabel(parsed.errorStrategy)}
          </span>
        </div>
      )}
    </div>
  )
})
