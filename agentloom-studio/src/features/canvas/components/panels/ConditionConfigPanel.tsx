import { memo, useCallback, useMemo } from 'react'
import { GitBranch, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  migrateConditionConfig,
  createDefaultBranch,
  formatBranchSummary,
  buildConditionOutputPorts,
  type ConditionNodeConfig,
  type ConditionBranch,
  type ConditionGroup,
} from '../../types/condition.types'
import { ConditionBuilder } from '../shared/ConditionBuilder'

// ── 单个分支编辑区块 ──────────────────────────────────────────

interface BranchSectionProps {
  branch: ConditionBranch
  index: number
  totalBranches: number
  onUpdate: (index: number, patch: Partial<ConditionBranch>) => void
  onRemove: (index: number) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
}

const BranchSection = memo(function BranchSection({
  branch,
  index,
  totalBranches,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: BranchSectionProps) {
  const isFirst = index === 0
  const isLast = index === totalBranches - 1
  const canDelete = !isFirst // IF 分支不可删除
  const summary = formatBranchSummary(branch)

  const handleConditionsChange = useCallback(
    (conditions: ConditionGroup) => {
      onUpdate(index, { conditions })
    },
    [index, onUpdate],
  )

  const handleExpressionChange = useCallback(
    (expression: string) => {
      onUpdate(index, { expression })
    },
    [index, onUpdate],
  )

  const handleModeToggle = useCallback(() => {
    onUpdate(index, {
      mode: branch.mode === 'visual' ? 'expression' : 'visual',
    })
  }, [index, branch.mode, onUpdate])

  const handleRemove = useCallback(() => {
    onRemove(index)
  }, [index, onRemove])

  const handleMoveUp = useCallback(() => {
    onMoveUp(index)
  }, [index, onMoveUp])

  const handleMoveDown = useCallback(() => {
    onMoveDown(index)
  }, [index, onMoveDown])

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* 分支标题栏 */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <span
          className={cn(
            'inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            branch.label === 'IF'
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-amber-500/15 text-amber-400',
          )}
        >
          {branch.label}
        </span>

        {summary ? (
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
            {summary}
          </span>
        ) : (
          <span className="flex-1 text-[10px] text-muted-foreground/40">
            {branch.mode === 'expression' ? '未配置表达式' : '未配置条件'}
          </span>
        )}

        {/* 排序按钮 */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={handleMoveUp}
            disabled={isFirst}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            aria-label="上移分支"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleMoveDown}
            disabled={isLast}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            aria-label="下移分支"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 删除按钮 */}
        {canDelete && (
          <button
            type="button"
            onClick={handleRemove}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-error/10 hover:text-error"
            aria-label="删除分支"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 条件编辑区 */}
      <div className="px-3 py-2">
        <ConditionBuilder
          conditions={branch.conditions}
          onChange={handleConditionsChange}
          mode={branch.mode}
          expression={branch.expression}
          onExpressionChange={handleExpressionChange}
          onModeToggle={handleModeToggle}
          showModeToggle
        />
      </div>
    </div>
  )
})

// ── ConditionConfigPanel 主体 ─────────────────────────────────

interface ConditionConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

export const ConditionConfigPanel = memo(function ConditionConfigPanel({
  config,
  onApply,
}: ConditionConfigPanelProps) {
  const parsed = useMemo(() => migrateConditionConfig(config), [config])

  /** 计算新 config + outputPorts 并上报 */
  const applyBranches = useCallback(
    (nextBranches: ConditionBranch[]) => {
      const nextConfig: ConditionNodeConfig = { branches: nextBranches }
      const outputPorts = buildConditionOutputPorts(nextBranches)
      onApply({ config: nextConfig, outputPorts })
    },
    [onApply],
  )

  const handleBranchUpdate = useCallback(
    (index: number, patch: Partial<ConditionBranch>) => {
      const next = parsed.branches.map((b, i) =>
        i === index ? { ...b, ...patch } : b,
      )
      applyBranches(next)
    },
    [parsed.branches, applyBranches],
  )

  const handleBranchRemove = useCallback(
    (index: number) => {
      if (index === 0) return // IF 不可删
      const remaining = parsed.branches.filter((_, i) => i !== index)
      // 重新编号
      const renumbered = remaining.map((branch, i) => ({
        ...branch,
        id: `branch-${i}`,
        label: i === 0 ? 'IF' : 'ELSE IF',
      }))
      applyBranches(renumbered)
    },
    [parsed.branches, applyBranches],
  )

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index <= 0) return
      const next = [...parsed.branches]
      const a = next[index - 1]
      const b = next[index]
      if (!a || !b) return
      next[index - 1] = b
      next[index] = a
      const renumbered = next.map((branch, i) => ({
        ...branch,
        id: `branch-${i}`,
        label: i === 0 ? 'IF' : 'ELSE IF',
      }))
      applyBranches(renumbered)
    },
    [parsed.branches, applyBranches],
  )

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= parsed.branches.length - 1) return
      const next = [...parsed.branches]
      const a = next[index]
      const b = next[index + 1]
      if (!a || !b) return
      next[index] = b
      next[index + 1] = a
      const renumbered = next.map((branch, i) => ({
        ...branch,
        id: `branch-${i}`,
        label: i === 0 ? 'IF' : 'ELSE IF',
      }))
      applyBranches(renumbered)
    },
    [parsed.branches, applyBranches],
  )

  const handleAddBranch = useCallback(() => {
    const nextIndex = parsed.branches.length
    applyBranches([...parsed.branches, createDefaultBranch(nextIndex)])
  }, [parsed.branches, applyBranches])

  return (
    <div className="space-y-4 px-4 py-4">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">条件分支</span>
        <span className="text-xs text-muted-foreground">
          {parsed.branches.length + 1} 路输出
        </span>
      </div>

      {/* 分支列表 */}
      <div className="space-y-3">
        {parsed.branches.map((branch, index) => (
          <BranchSection
            key={branch.id}
            branch={branch}
            index={index}
            totalBranches={parsed.branches.length}
            onUpdate={handleBranchUpdate}
            onRemove={handleBranchRemove}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
        ))}
      </div>

      {/* 添加 ELSE IF */}
      <button
        type="button"
        onClick={handleAddBranch}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>添加 ELSE IF 分支</span>
      </button>

      {/* ELSE 分支说明 */}
      <div className="rounded-lg border border-border bg-muted/10 p-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            ELSE
          </span>
          <span className="text-xs text-muted-foreground">
            以上所有条件均不满足时走此分支
          </span>
        </div>
      </div>

      {/* 输出端口预览 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-foreground">输出端口</p>
        <div className="flex flex-col gap-1.5 text-xs">
          {parsed.branches.map((branch, index) => (
            <div key={branch.id} className="flex items-center gap-2">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  index === 0 ? 'bg-blue-500' : 'bg-amber-500',
                )}
              />
              <span className="font-medium text-foreground">
                {branch.id}
              </span>
              <span className="text-muted-foreground">
                {branch.label}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            <span className="font-medium text-foreground">else</span>
            <span className="text-muted-foreground">默认分支</span>
          </div>
        </div>
      </div>
    </div>
  )
})
