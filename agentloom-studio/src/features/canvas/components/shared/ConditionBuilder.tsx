/**
 * 可视化条件构建器
 *
 * - 条件左值基于输入端口引用，而不是变量名
 * - 结构化输入允许补充字段路径
 * - 表达式模式统一使用 `ports[n]`
 */
import { memo, useCallback, type ChangeEvent } from 'react'
import { Code, Eye, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import {
  CONDITION_OPERATORS,
  OPERATOR_META,
  createDefaultRule,
  type ConditionGroup,
  type ConditionLogic,
  type ConditionOperator,
  type ConditionRule,
} from '../../types/condition.types'

export interface ConditionInputBinding {
  portId: string
  label: string
  portRef: string
  supportsFieldPath: boolean
  dataTypeLabel?: string
}

interface ConditionRuleRowProps {
  rule: ConditionRule
  index: number
  totalRules: number
  logic: ConditionLogic
  availablePorts: ConditionInputBinding[]
  onUpdate: (index: number, patch: Partial<ConditionRule>) => void
  onRemove: (index: number) => void
  onLogicToggle: () => void
}

function findSelectedPort(
  availablePorts: ConditionInputBinding[],
  portId: string,
): ConditionInputBinding | null {
  return availablePorts.find((port) => port.portId === portId) ?? null
}

const ConditionRuleRow = memo(function ConditionRuleRow({
  rule,
  index,
  totalRules,
  logic,
  availablePorts,
  onUpdate,
  onRemove,
  onLogicToggle,
}: ConditionRuleRowProps) {
  const operatorMeta = OPERATOR_META[rule.operator]
  const selectedPort =
    findSelectedPort(availablePorts, rule.sourcePortId)
    ?? availablePorts[0]
    ?? null
  const supportsFieldPath = selectedPort?.supportsFieldPath ?? false

  const handlePortChange = useCallback(
    (value: string) => {
      const nextPort = findSelectedPort(availablePorts, value)
      onUpdate(index, {
        sourcePortId: value,
        fieldPath: nextPort?.supportsFieldPath ? rule.fieldPath : '',
      })
    },
    [availablePorts, index, onUpdate, rule.fieldPath],
  )

  const handleFieldPathChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, { fieldPath: event.target.value })
    },
    [index, onUpdate],
  )

  const handleOperatorChange = useCallback(
    (value: string) => {
      onUpdate(index, { operator: value as ConditionOperator })
    },
    [index, onUpdate],
  )

  const handleValueChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, { value: event.target.value })
    },
    [index, onUpdate],
  )

  const handleRemove = useCallback(() => {
    onRemove(index)
  }, [index, onRemove])

  return (
    <div className="space-y-1.5">
      {index > 0 && (
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-border/50" />
          <button
            type="button"
            onClick={onLogicToggle}
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
              logic === 'and'
                ? 'bg-info/15 text-info hover:bg-info/25'
                : 'bg-warning/15 text-warning hover:bg-warning/25',
            )}
          >
            {logic === 'and' ? 'AND' : 'OR'}
          </button>
          <div className="h-px flex-1 bg-border/50" />
        </div>
      )}

      <div className="grid gap-1.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_auto_minmax(0,1fr)_auto]">
        <Select
          value={selectedPort?.portId ?? rule.sourcePortId}
          onValueChange={handlePortChange}
          disabled={availablePorts.length === 0}
        >
          <SelectTrigger
            aria-label={`条件 ${index + 1} 输入端口`}
            className="h-8 min-w-0 px-2 text-xs"
          >
            <SelectValue
              placeholder={
                availablePorts.length === 0 ? '暂无可用输入端口' : '选择输入端口'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {availablePorts.map((port) => (
              <SelectItem key={port.portId} value={port.portId} className="text-xs">
                {port.label} · {port.portRef}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          type="text"
          value={supportsFieldPath ? rule.fieldPath : ''}
          onChange={handleFieldPathChange}
          disabled={!supportsFieldPath}
          placeholder={supportsFieldPath ? '字段路径（可选）' : '该输入只支持整值比较'}
          className="h-8 min-w-0 rounded-md border border-border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        />

        <Select value={rule.operator} onValueChange={handleOperatorChange}>
          <SelectTrigger
            aria-label={`条件 ${index + 1} 运算符`}
            className="h-8 w-auto shrink-0 px-1.5 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="w-auto min-w-[10rem]">
            {CONDITION_OPERATORS.map((operator) => (
              <SelectItem key={operator} value={operator} className="text-xs">
                {OPERATOR_META[operator].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {operatorMeta.requiresValue ? (
          <input
            type="text"
            value={rule.value}
            onChange={handleValueChange}
            placeholder="值"
            className="h-8 min-w-0 rounded-md border border-border bg-background px-2 text-xs"
          />
        ) : (
          <div className="h-8 rounded-md border border-dashed border-border/50 bg-muted/10 px-2 text-xs leading-8 text-muted-foreground">
            当前运算符不需要右值
          </div>
        )}

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

      {selectedPort && (
        <p className="px-1 text-[10px] text-muted-foreground">
          左值来源：{selectedPort.portRef}
          {selectedPort.dataTypeLabel ? ` · 当前输入类型 ${selectedPort.dataTypeLabel}` : ''}
        </p>
      )}
    </div>
  )
})

export interface ConditionBuilderProps {
  conditions: ConditionGroup
  onChange: (conditions: ConditionGroup) => void
  availablePorts: ConditionInputBinding[]
  isExpressionMode?: boolean
  expression?: string
  onExpressionChange?: (expression: string) => void
  onModeToggle?: () => void
  mode?: 'visual' | 'expression'
  showModeToggle?: boolean
}

export const ConditionBuilder = memo(function ConditionBuilder({
  conditions,
  onChange,
  availablePorts,
  isExpressionMode,
  expression,
  onExpressionChange,
  onModeToggle,
  mode = 'visual',
  showModeToggle = true,
}: ConditionBuilderProps) {
  const fallbackPortId = availablePorts[0]?.portId

  const handleRuleUpdate = useCallback(
    (index: number, patch: Partial<ConditionRule>) => {
      const nextRules = conditions.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      )
      onChange({ ...conditions, rules: nextRules })
    },
    [conditions, onChange],
  )

  const handleRuleRemove = useCallback(
    (index: number) => {
      if (conditions.rules.length <= 1) {
        return
      }

      const nextRules = conditions.rules.filter((_, ruleIndex) => ruleIndex !== index)
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
      rules: [...conditions.rules, createDefaultRule(fallbackPortId)],
    })
  }, [conditions, fallbackPortId, onChange])

  const handleExpressionInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onExpressionChange?.(event.target.value)
    },
    [onExpressionChange],
  )

  return (
    <div className="space-y-2">
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

      {(isExpressionMode || mode === 'expression') && (
        <div className="space-y-1.5">
          <textarea
            value={expression ?? ''}
            onChange={handleExpressionInputChange}
            rows={3}
            placeholder={'例: ports[1] === "ready"\n例: ports[2].score > 80 && ports[3]'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
          />
          <p className="text-[10px] text-muted-foreground">
            表达式左值统一使用 `ports[n]`。`ports[1]` 表示第 1 个输入端口，结构化输入可继续写字段路径。
          </p>
        </div>
      )}

      {mode === 'visual' && !isExpressionMode && (
        <div className="space-y-1.5">
          {conditions.rules.map((rule, index) => (
            <ConditionRuleRow
              key={`${rule.sourcePortId}-${index}`}
              rule={rule}
              index={index}
              totalRules={conditions.rules.length}
              logic={conditions.logic}
              availablePorts={availablePorts}
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
