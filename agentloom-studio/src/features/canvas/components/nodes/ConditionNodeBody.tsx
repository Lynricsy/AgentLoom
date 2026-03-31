import { memo, useMemo } from 'react'
import { GitBranch } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  migrateConditionConfig,
  formatBranchSummary,
  type ConditionBranch,
} from '../../types/condition.types'

const MAX_SUMMARY_LEN = 40

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

interface BranchRowProps {
  branch: ConditionBranch
  isLast: boolean
}

const BranchRow = memo(function BranchRow({ branch, isLast }: BranchRowProps) {
  const summary = formatBranchSummary(branch)
  const isExpression = branch.mode === 'expression'
  const hasSummary = summary.length > 0

  return (
    <div
      className={cn(
        'flex min-h-[20px] items-center gap-1.5 px-1.5 py-0.5',
        !isLast && 'border-b border-border/30',
      )}
    >
      {/* 分支标签 */}
      <span
        className={cn(
          'inline-flex shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wider',
          branch.label === 'IF' && 'bg-blue-500/15 text-blue-400',
          branch.label === 'ELSE IF' && 'bg-amber-500/15 text-amber-400',
        )}
      >
        {branch.label}
      </span>

      {/* 条件摘要 */}
      {hasSummary ? (
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[10px]',
            isExpression ? 'font-mono text-amber-300/80' : 'text-muted-foreground',
          )}
        >
          {truncate(summary, MAX_SUMMARY_LEN)}
        </span>
      ) : (
        <span className="flex-1 text-[10px] text-muted-foreground/40">
          {branch.mode === 'expression' ? '未配置表达式' : '未配置条件'}
        </span>
      )}
    </div>
  )
})

export const ConditionNodeBody = memo(function ConditionNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const parsed = useMemo(() => migrateConditionConfig(config), [config])

  return (
    <div className="flex flex-col gap-1" data-testid="condition-node-body">
      {/* 标题 */}
      <div className="flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] font-medium text-foreground">
          条件分支
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {parsed.branches.length + 1} 路
        </span>
      </div>

      {/* 分支列表 */}
      <div className="rounded border border-border/40 bg-muted/10">
        {parsed.branches.map((branch) => (
          <BranchRow
            key={branch.id}
            branch={branch}
            isLast={false}
          />
        ))}

        {/* ELSE 分支（始终存在） */}
        <div className="flex min-h-[20px] items-center gap-1.5 px-1.5 py-0.5">
          <span className="inline-flex shrink-0 rounded bg-muted/30 px-1 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wider text-muted-foreground/70">
            ELSE
          </span>
          <span className="flex-1 text-[10px] text-muted-foreground/40">
            默认分支
          </span>
        </div>
      </div>
    </div>
  )
})
