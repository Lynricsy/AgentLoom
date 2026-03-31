/**
 * 可视化条件构建器 — 共享组件
 *
 * 被 ConditionConfigPanel（Condition 节点）和未来的 LoopConfigPanel（Loop 停止条件）复用。
 * 渲染条件行: [变量输入] [运算符下拉] [值输入]，同一组内支持 AND/OR 切换。
 */
import { memo, useCallback, type ChangeEvent } from 'react'
import { Plus, Trash2, Code, Eye } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  CONDITION_OPERATORS,
  OPERATOR_META,
  createDefaultRule,
  type ConditionGroup,
  type ConditionLogic,
  type ConditionOperator,
  type ConditionRule,
} from '../../types/condition.types'

// ── 单条件规则行 ─────────────────────────────────────────────

interface ConditionRuleRowProps {
  rule: ConditionRule
  index: number
  totalRules: number
  logic: ConditionLogic
  onUpdate: (index: number, patch: Partial<ConditionRule>) => void
  onRemove: (index: number) => void
  onLogicToggle: () => void
}

const ConditionRuleRow = memo(function ConditionRuleRow({
  rule,
  index,
  totalRules,
  logic,
  onUpdate,
  onRemove,
  onLogicToggle,
}: ConditionRuleRowProps) {
  const operatorMeta = OPERATOR_META[rule.operator]

  const handleFieldChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, { field: e.target.value })
    },
    [index, onUpdate],
  )

  const handleOperatorChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      onUpdate(index, { operator: e.target.value as ConditionOperator })
    },
    [index, onUpdate],
  )

  const handleValueChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, { value: e.target.value })
    },
    [index, onUpdate],
  )

  const handleRemove = useCallback(() => {
    onRemove(index)
  }, [index, onRemove])

  return (
    <div className="space-y-1.5">
      {/* AND/OR 连接符（第二行起显示） */}
      {index > 0 && (
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-border/50" />
          <button
            type="button"
            onClick={onLogicToggle}
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
              logic === 'and'
                ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25'
                : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25',
            )}
          >
            {logic === 'and' ? 'AND' : 'OR'}
          </button>
          <div className="h-px flex-1 bg-border/50" />
        </div>
      )}

      {/* 条件行 */}
      <div className="flex items-start gap-1.5">
        {/* 变量 */}
        <input
          type="text"
          value={rule.field}
          onChange={handleFieldChange}
          placeholder="变量名"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
        />

        {/* 运算符 */}
        <select
          value={rule.operator}
          onChange={handleOperatorChange}
          className="h-8 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs"
        >
          {CONDITION_OPERATORS.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_META[op].label}
            </option>
          ))}
        </select>

        {/* 值（仅当运算符需要值时显示） */}
        {operatorMeta.requiresValue && (
          <input
            type="text"
            value={rule.value}
            onChange={handleValueChange}
            placeholder="值"
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
          />
        )}

        {/* 删除按钮（至少保留一行） */}
        <button
          type="button"
          onClick={handleRemove}
          disabled={totalRules <= 1}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          aria-label="删除条件"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
})

// ── 条件组构建器 ─────────────────────────────────────────────

export interface ConditionBuilderProps {
  /** 条件组（rules + logic） */
  conditions: ConditionGroup
  /** 条件变更回调 */
  onChange: (conditions: ConditionGroup) => void
  /** 是否处于表达式模式（隐藏可视化构建器） */
  isExpressionMode?: boolean
  /** 表达式内容 */
  expression?: string
  /** 表达式变更回调 */
  onExpressionChange?: (expression: string) => void
  /** 模式切换回调 */
  onModeToggle?: () => void
  /** 当前模式 */
  mode?: 'visual' | 'expression'
  /** 是否显示模式切换按钮 */
  showModeToggle?: boolean
}

export const ConditionBuilder = memo(function ConditionBuilder({
  conditions,
  onChange,
  isExpressionMode,
  expression,
  onExpressionChange,
  onModeToggle,
  mode = 'visual',
  showModeToggle = true,
}: ConditionBuilderProps) {
  const handleRuleUpdate = useCallback(
    (index: number, patch: Partial<ConditionRule>) => {
      const nextRules = conditions.rules.map((rule, i) =>
        i === index ? { ...rule, ...patch } : rule,
      )
      onChange({ ...conditions, rules: nextRules })
    },
    [conditions, onChange],
  )

  const handleRuleRemove = useCallback(
    (index: number) => {
      if (conditions.rules.length <= 1) return
      const nextRules = conditions.rules.filter((_, i) => i !== index)
      onChange({ ...conditions, rules: nextRules })
    },
    [conditions, onChange],
  )

  const handleLogicToggle = useCallback(() => {
    onChange({
      ...conditions,
      logic: conditions.logic === 'and' ? 'or' : 'and',
    })
  }, [conditions, onChange])

  const handleAddRule = useCallback(() => {
    onChange({
      ...conditions,
      rules: [...conditions.rules, createDefaultRule()],
    })
  }, [conditions, onChange])

  const handleExpressionChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onExpressionChange?.(e.target.value)
    },
    [onExpressionChange],
  )

  return (
    <div className="space-y-2">
      {/* 模式切换 */}
      {showModeToggle && onModeToggle && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onModeToggle}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {mode === 'visual' ? (
              <>
                <Code className="h-3 w-3" />
                <span>表达式模式</span>
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                <span>可视化模式</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 表达式模式 */}
      {(isExpressionMode || mode === 'expression') && (
        <div className="space-y-1.5">
          <textarea
            value={expression ?? ''}
            onChange={handleExpressionChange}
            rows={3}
            placeholder={'例: input.score > 80\n例: input.status === "active" && input.verified'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
          />
          <p className="text-[10px] text-muted-foreground">
            JavaScript 表达式，输入数据以 input 变量传入，返回 truthy 值表示匹配
          </p>
        </div>
      )}

      {/* 可视化模式 */}
      {mode === 'visual' && !isExpressionMode && (
        <div className="space-y-1.5">
          {conditions.rules.map((rule, index) => (
            <ConditionRuleRow
              key={index}
              rule={rule}
              index={index}
              totalRules={conditions.rules.length}
              logic={conditions.logic}
              onUpdate={handleRuleUpdate}
              onRemove={handleRuleRemove}
              onLogicToggle={handleLogicToggle}
            />
          ))}

          <button
            type="button"
            onClick={handleAddRule}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            <span>添加条件</span>
          </button>
        </div>
      )}
    </div>
  )
})
