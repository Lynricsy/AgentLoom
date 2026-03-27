import { memo } from 'react'
import { GitBranch } from 'lucide-react'

export const ConditionNodeBody = memo(function ConditionNodeBody({
  config,
}: {
  config: Record<string, unknown>
}) {
  const mode =
    typeof config.mode === 'string' && config.mode === 'field-comparison'
      ? 'field-comparison'
      : 'expression'
  const expression =
    typeof config.expression === 'string' ? config.expression : ''
  const conditionField =
    typeof config.conditionField === 'string' ? config.conditionField : ''
  const expectedValue = config.expectedValue

  const isExpression = mode === 'expression'
  const hasConfig = isExpression ? !!expression : !!conditionField

  return (
    <div className="flex flex-col gap-1" data-testid="condition-node-body">
      <div className="flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            isExpression
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-blue-500/15 text-blue-400'
          }`}
        >
          {isExpression ? '表达式' : '字段比较'}
        </span>
      </div>

      {hasConfig ? (
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {isExpression
            ? expression.length > 50
              ? `${expression.slice(0, 50)}…`
              : expression
            : `${conditionField} = ${typeof expectedValue === 'string' ? expectedValue : JSON.stringify(expectedValue ?? '')}`}
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground/60">未配置</p>
      )}

      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-emerald-400">✓ matched</span>
        <span className="text-red-400">✗ unmatched</span>
      </div>
    </div>
  )
})
