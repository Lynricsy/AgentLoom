import { memo } from 'react'
import type { CompoundSpecialNodeType } from '../../types/controlFlow.types'

function resolveJumpMode(config: Record<string, unknown>): 'always' | 'expression' {
  return config.mode === 'expression' ? 'expression' : 'always'
}

function renderChip(label: string) {
  return (
    <span className="rounded border border-border/50 bg-muted/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {label}
    </span>
  )
}

export const ControlFlowSpecialNodeBody = memo(function ControlFlowSpecialNodeBody({
  nodeType,
  config,
}: {
  nodeType: CompoundSpecialNodeType
  config: Record<string, unknown>
}) {
  if (nodeType === 'loop-start') {
    const exposures = ['输出 round / state']
    if (config.exposePreviousResult === true) {
      exposures.push('previous-result')
    }
    if (config.exposeIsFirst === true) {
      exposures.push('is-first')
    }

    return (
      <div className="flex flex-col gap-2" data-testid="control-flow-node-body-loop-start">
        <div className="text-[10px] leading-4 text-muted-foreground">
          每轮开始时把上下文显式送入内部子图。
        </div>
        <div className="flex flex-wrap gap-1">
          {exposures.map((label) => (
            <span
              key={label}
              className="rounded border border-border/50 bg-muted/10 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (nodeType === 'iteration-start') {
    const exposures = ['输出 item / index']
    if (config.exposeTotal === true) {
      exposures.push('total')
    }
    if (config.exposeIsFirst === true) {
      exposures.push('is-first')
    }
    if (config.exposeIsLast === true) {
      exposures.push('is-last')
    }

    return (
      <div className="flex flex-col gap-2" data-testid="control-flow-node-body-iteration-start">
        <div className="text-[10px] leading-4 text-muted-foreground">
          每个数组项开始时把 item 上下文显式送入内部子图。
        </div>
        <div className="flex flex-wrap gap-1">
          {exposures.map((label) => (
            <span
              key={label}
              className="rounded border border-border/50 bg-muted/10 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (nodeType === 'loop-state') {
    return (
      <div className="flex flex-col gap-2" data-testid="control-flow-node-body-loop-state">
        <div className="text-[10px] leading-4 text-muted-foreground">
          把当前轮计算出的状态提交给下一轮；未命中时沿用上一轮 state。
        </div>
        <div className="flex flex-wrap gap-1">
          {renderChip('输入 state-in')}
          {renderChip('继续内部链路')}
        </div>
      </div>
    )
  }

  if (nodeType === 'result') {
    const outputKey =
      typeof config.outputKey === 'string' && config.outputKey.trim().length > 0
        ? config.outputKey.trim()
        : 'result'

    return (
      <div className="flex flex-col gap-2" data-testid="control-flow-node-body-result">
        <div className="text-[10px] leading-4 text-muted-foreground">
          向父容器显式提交结果；一个 output key 只能对应唯一来源。
        </div>
        <div className="flex flex-wrap gap-1">
          {renderChip(`outputKey: ${outputKey}`)}
        </div>
      </div>
    )
  }

  const mode = resolveJumpMode(config)
  const expression =
    typeof config.expression === 'string' && config.expression.trim().length > 0
      ? config.expression.trim()
      : null
  const actionLabel = nodeType === 'break' ? '结束整个 compound' : '丢弃当前轮并进入下一轮'

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`control-flow-node-body-${nodeType}`}
    >
      <div className="text-[10px] leading-4 text-muted-foreground">
        {actionLabel}
      </div>
      <div className="flex flex-wrap gap-1">
        {renderChip(mode === 'expression' ? '表达式触发' : '总是触发')}
      </div>
      {mode === 'expression' && expression ? (
        <code className="block rounded border border-border/50 bg-background/70 px-2 py-1 text-[10px] leading-4 text-foreground">
          {expression}
        </code>
      ) : null}
    </div>
  )
})
