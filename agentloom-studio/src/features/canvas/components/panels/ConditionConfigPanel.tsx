import { memo, useCallback, type ChangeEvent } from 'react'
import { GitBranch } from 'lucide-react'

type ConditionMode = 'expression' | 'field-comparison'

interface ConditionConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

interface ConditionConfig {
  mode: ConditionMode
  expression: string
  conditionField: string
  expectedValue: string
}

function parseConditionConfig(config: Record<string, unknown>): ConditionConfig {
  const mode = config.mode
  return {
    mode:
      mode === 'expression' || mode === 'field-comparison'
        ? mode
        : 'expression',
    expression: typeof config.expression === 'string' ? config.expression : '',
    conditionField:
      typeof config.conditionField === 'string' ? config.conditionField : '',
    expectedValue:
      typeof config.expectedValue === 'string'
        ? config.expectedValue
        : config.expectedValue != null
          ? String(config.expectedValue)
          : '',
  }
}

export const ConditionConfigPanel = memo(function ConditionConfigPanel({
  config,
  onApply,
}: ConditionConfigPanelProps) {
  const parsed = parseConditionConfig(config)

  const applyPatch = useCallback(
    (patch: Partial<ConditionConfig>) => {
      const next = { ...parseConditionConfig(config), ...patch }
      onApply({ config: next })
    },
    [config, onApply],
  )

  const handleModeChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      applyPatch({ mode: e.target.value as ConditionMode })
    },
    [applyPatch],
  )

  const handleExpression = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      applyPatch({ expression: e.target.value })
    },
    [applyPatch],
  )

  const handleConditionField = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyPatch({ conditionField: e.target.value })
    },
    [applyPatch],
  )

  const handleExpectedValue = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyPatch({ expectedValue: e.target.value })
    },
    [applyPatch],
  )

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">条件分支</span>
      </div>

      {/* 模式选择 */}
      <div>
        <label
          htmlFor="condition-mode"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          判断模式
        </label>
        <select
          id="condition-mode"
          value={parsed.mode}
          onChange={handleModeChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="expression">表达式</option>
          <option value="field-comparison">字段比较</option>
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          {parsed.mode === 'expression'
            ? '使用 JavaScript 表达式求值，输入数据以 input 变量传入'
            : '比较输入数据中指定字段的值是否与期望值相等'}
        </p>
      </div>

      {/* 表达式模式 */}
      {parsed.mode === 'expression' && (
        <div>
          <label
            htmlFor="condition-expression"
            className="mb-2 block text-xs font-medium text-foreground"
          >
            条件表达式 <span className="text-error">*</span>
          </label>
          <textarea
            id="condition-expression"
            value={parsed.expression}
            onChange={handleExpression}
            rows={4}
            placeholder={'例：input.status === "active"\n例：input.score > 80 && input.verified'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            表达式结果为 truthy 时走 matched 分支，否则走 unmatched 分支
          </p>
        </div>
      )}

      {/* 字段比较模式 */}
      {parsed.mode === 'field-comparison' && (
        <>
          <div>
            <label
              htmlFor="condition-field"
              className="mb-2 block text-xs font-medium text-foreground"
            >
              字段名 <span className="text-error">*</span>
            </label>
            <input
              id="condition-field"
              type="text"
              value={parsed.conditionField}
              onChange={handleConditionField}
              placeholder="例：status"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              输入数据中要比较的字段路径
            </p>
          </div>

          <div>
            <label
              htmlFor="condition-expected-value"
              className="mb-2 block text-xs font-medium text-foreground"
            >
              期望值 <span className="text-error">*</span>
            </label>
            <input
              id="condition-expected-value"
              type="text"
              value={parsed.expectedValue}
              onChange={handleExpectedValue}
              placeholder="例：active"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              字段值等于期望值时走 matched 分支
            </p>
          </div>
        </>
      )}

      {/* 分支预览 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-medium text-foreground">输出分支</p>
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-emerald-400">matched</span>
            <span className="text-muted-foreground">— 条件为真时</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="font-medium text-red-400">unmatched</span>
            <span className="text-muted-foreground">— 条件为假时</span>
          </div>
        </div>
      </div>
    </div>
  )
})
