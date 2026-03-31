import { memo, useCallback, useMemo, type ChangeEvent } from 'react'
import { Repeat } from 'lucide-react'
import {
  parseLoopNodeConfig,
  createDefaultConditionGroup,
  type LoopNodeConfig,
  type StopConditionMode,
  type ErrorStrategy,
  type ConditionGroup,
} from '../../types/condition.types'
import { ConditionBuilder } from '../shared/ConditionBuilder'

// ── LoopConfigPanel ─────────────────────────────────────────────

interface LoopConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const LoopConfigPanel = memo(function LoopConfigPanel({
  config,
  onApply,
}: LoopConfigPanelProps) {
  const parsed = useMemo(() => parseLoopNodeConfig(config), [config])

  const applyConfig = useCallback(
    (patch: Partial<LoopNodeConfig>) => {
      const next: LoopNodeConfig = { ...parsed, ...patch }
      onApply({ config: next })
    },
    [parsed, onApply],
  )

  // ── maxIterations ──────────────────────────────────────────
  const handleMaxIterationsChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value)
      const value = Number.isFinite(raw) ? clamp(Math.floor(raw), 1, 1000) : 10
      applyConfig({ maxIterations: value })
    },
    [applyConfig],
  )

  // ── stopConditionMode ──────────────────────────────────────
  const handleStopModeChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const mode = e.target.value as StopConditionMode
      applyConfig({
        stopConditionMode: mode,
        // 切换到 condition 时初始化默认条件组
        ...(mode === 'condition' && !parsed.stopCondition
          ? { stopCondition: createDefaultConditionGroup() }
          : {}),
      })
    },
    [applyConfig, parsed.stopCondition],
  )

  // ── stopCondition (visual mode) ────────────────────────────
  const handleStopConditionChange = useCallback(
    (conditions: ConditionGroup) => {
      applyConfig({ stopCondition: conditions })
    },
    [applyConfig],
  )

  // ── stopExpression ─────────────────────────────────────────
  const handleStopExpressionChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      applyConfig({ stopExpression: e.target.value })
    },
    [applyConfig],
  )

  // ── errorStrategy ──────────────────────────────────────────
  const handleErrorStrategyChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      applyConfig({ errorStrategy: e.target.value as ErrorStrategy })
    },
    [applyConfig],
  )

  return (
    <div className="space-y-4 px-4 py-4">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">循环配置</span>
      </div>

      {/* 最大迭代次数 */}
      <div>
        <label
          htmlFor="loop-max-iterations"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          最大迭代次数
        </label>
        <input
          id="loop-max-iterations"
          type="number"
          min={1}
          max={1000}
          step={1}
          value={parsed.maxIterations}
          onChange={handleMaxIterationsChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          循环最多执行的次数（1 - 1000）
        </p>
      </div>

      {/* 停止条件 */}
      <div>
        <label
          htmlFor="loop-stop-mode"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          停止条件
        </label>
        <select
          id="loop-stop-mode"
          value={parsed.stopConditionMode}
          onChange={handleStopModeChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="none">无停止条件</option>
          <option value="condition">可视化条件</option>
          <option value="expression">JS 表达式</option>
        </select>
        <p className="mt-1 text-[10px] text-muted-foreground">
          每次迭代完成后评估，满足条件时提前退出循环
        </p>
      </div>

      {/* 可视化停止条件 */}
      {parsed.stopConditionMode === 'condition' && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-[10px] font-medium text-foreground">
            停止条件（对每次迭代的输出评估）
          </p>
          <ConditionBuilder
            conditions={parsed.stopCondition ?? createDefaultConditionGroup()}
            onChange={handleStopConditionChange}
            mode="visual"
            showModeToggle={false}
          />
        </div>
      )}

      {/* 表达式停止条件 */}
      {parsed.stopConditionMode === 'expression' && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-[10px] font-medium text-foreground">
            停止表达式（对每次迭代的输出评估）
          </p>
          <textarea
            value={parsed.stopExpression}
            onChange={handleStopExpressionChange}
            rows={3}
            placeholder={'例: input.quality_score > 0.9\n例: input.total_count >= 100'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            JavaScript 表达式，当前迭代输出以 input 变量传入，返回 truthy 值表示停止
          </p>
        </div>
      )}

      {/* 错误处理策略 */}
      <div>
        <label
          htmlFor="loop-error-strategy"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          错误处理策略
        </label>
        <select
          id="loop-error-strategy"
          value={parsed.errorStrategy}
          onChange={handleErrorStrategyChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="stop">停止循环</option>
          <option value="skip">跳过并继续</option>
          <option value="collect">收集错误继续</option>
        </select>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {parsed.errorStrategy === 'stop' && '遇到错误时立即停止循环执行'}
          {parsed.errorStrategy === 'skip' && '跳过出错的项，继续处理后续项'}
          {parsed.errorStrategy === 'collect' && '收集所有错误，循环结束后一起报告'}
        </p>
      </div>

      {/* 配置摘要 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
        <p className="font-medium text-foreground">当前配置</p>
        <div className="flex flex-col gap-1 text-muted-foreground">
          <span>最大迭代: {parsed.maxIterations} 次</span>
          <span>
            停止条件:{' '}
            {parsed.stopConditionMode === 'none'
              ? '无'
              : parsed.stopConditionMode === 'condition'
                ? '可视化条件'
                : 'JS 表达式'}
          </span>
          <span>
            出错处理:{' '}
            {parsed.errorStrategy === 'stop'
              ? '停止循环'
              : parsed.errorStrategy === 'skip'
                ? '跳过并继续'
                : '收集错误继续'}
          </span>
        </div>
      </div>
    </div>
  )
})
