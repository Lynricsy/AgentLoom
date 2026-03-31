import { memo, useMemo } from 'react'
import { GitMerge } from 'lucide-react'
import {
  parseMergeNodeConfig,
  getMergeModeLabel,
} from '../../types/condition.types'

export const MergeNodeBody = memo(function MergeNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const parsed = useMemo(() => parseMergeNodeConfig(config), [config])

  return (
    <div className="flex flex-col gap-1" data-testid="merge-node-body">
      {/* 标题 */}
      <div className="flex items-center gap-1.5">
        <GitMerge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] font-medium text-foreground">
          合并
        </span>
      </div>

      {/* 合并模式 */}
      <div className="rounded border border-border/40 bg-muted/10 px-1.5 py-1">
        <span className="text-[10px] text-muted-foreground">
          模式: {getMergeModeLabel(parsed.mode)}
        </span>
      </div>

      {/* 合并键（仅 merge-by-key 模式显示） */}
      {parsed.mode === 'merge-by-key' && parsed.mergeKey && (
        <div className="rounded border border-border/40 bg-muted/10 px-1.5 py-1">
          <span className="text-[10px] text-muted-foreground">
            键: <span className="font-mono text-foreground/80">{parsed.mergeKey}</span>
          </span>
        </div>
      )}

      {/* 输入数量 */}
      <div className="rounded border border-border/40 bg-muted/10 px-1.5 py-1">
        <span className="text-[10px] text-muted-foreground">
          等待 {parsed.inputCount} 个输入
        </span>
      </div>
    </div>
  )
})
