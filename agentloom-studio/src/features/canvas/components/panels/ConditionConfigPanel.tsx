import { memo, useCallback, useMemo } from 'react'
import { ChevronDown, ChevronUp, GitBranch, Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/shared/ui/toast'
import { cn } from '@/shared/lib/utils'
import type { PortDefinition } from '../../types/nodeTypeRegistry'
import {
  buildConditionInputPorts,
  buildConditionOutputPorts,
  getConditionPortOrder,
  getConditionValueInputPorts,
  migrateConditionConfig,
  renumberConditionBranches,
  rewriteConditionBranchExpressions,
  type ConditionBranch,
  type ConditionGroup,
  type ConditionNodeConfig,
} from '../../types/condition.types'
import { useCanvasEdges, useCanvasNodes } from '../../stores/canvasStore'
import {
  ConditionBuilder,
  type ConditionInputBinding,
} from '../shared/ConditionBuilder'

interface BranchSectionProps {
  branch: ConditionBranch
  index: number
  totalBranches: number
  availablePorts: ConditionInputBinding[]
  onUpdate: (index: number, patch: Partial<ConditionBranch>) => void
  onRemove: (index: number) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
}

const BranchSection = memo(function BranchSection({
  branch,
  index,
  totalBranches,
  availablePorts,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: BranchSectionProps) {
  const isFirst = index === 0
  const isLast = index === totalBranches - 1
  const canDelete = !isFirst

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
  }, [branch.mode, index, onUpdate])

  return (
    <div className="rounded-lg border border-border bg-card">
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

        <span className="flex-1 text-[10px] text-muted-foreground">
          {branch.mode === 'expression'
            ? branch.expression || '未配置表达式'
            : `${branch.conditions.rules.length} 条条件`}
        </span>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={isFirst}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            aria-label="上移分支"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={isLast}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            aria-label="下移分支"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {canDelete && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-error/10 hover:text-error"
            aria-label="删除分支"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="px-3 py-2">
        <ConditionBuilder
          conditions={branch.conditions}
          onChange={handleConditionsChange}
          availablePorts={availablePorts}
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

interface ConditionConfigPanelProps {
  nodeId: string
  inputPorts: PortDefinition[]
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

function isStructuredInput(dataType?: string, schema?: PortDefinition['schema']): boolean {
  if (dataType === 'array') {
    return true
  }

  if (!schema) {
    return false
  }

  return schema.kind === 'json'
}

export const ConditionConfigPanel = memo(function ConditionConfigPanel({
  nodeId,
  inputPorts,
  config,
  onApply,
}: ConditionConfigPanelProps) {
  const { notify } = useToast()
  const canvasNodes = useCanvasNodes()
  const canvasEdges = useCanvasEdges()
  const parsed = useMemo(() => migrateConditionConfig(config), [config])
  const valueInputPorts = useMemo(
    () => getConditionValueInputPorts(inputPorts),
    [inputPorts],
  )

  const availablePorts = useMemo<ConditionInputBinding[]>(() => {
    return valueInputPorts.map((port, index) => {
      const incomingEdge = canvasEdges.find(
        (edge) => edge.target === nodeId && edge.targetHandle === port.id,
      )
      const sourceNode = incomingEdge
        ? canvasNodes.find((node) => node.id === incomingEdge.source)
        : null
      const sourcePort = sourceNode?.data.outputPorts.find(
        (candidate) => candidate.id === incomingEdge?.sourceHandle,
      )

      return {
        portId: port.id,
        label: port.label,
        portRef: `ports[${index + 1}]`,
        supportsFieldPath: isStructuredInput(sourcePort?.dataType, sourcePort?.schema),
        dataTypeLabel: sourcePort?.dataType,
      }
    })
  }, [canvasEdges, canvasNodes, nodeId, valueInputPorts])

  const applyConfig = useCallback(
    (nextConfig: ConditionNodeConfig, nextInputPorts = inputPorts) => {
      onApply({
        config: nextConfig,
        inputPorts: nextInputPorts,
        outputPorts: buildConditionOutputPorts(nextConfig.branches),
      })
    },
    [inputPorts, onApply],
  )

  const handleBranchUpdate = useCallback(
    (index: number, patch: Partial<ConditionBranch>) => {
      const nextBranches = parsed.branches.map((branch, branchIndex) =>
        branchIndex === index ? { ...branch, ...patch } : branch,
      )
      applyConfig({ branches: nextBranches })
    },
    [applyConfig, parsed.branches],
  )

  const handleBranchRemove = useCallback(
    (index: number) => {
      if (index === 0) {
        return
      }

      applyConfig({
        branches: renumberConditionBranches(
          parsed.branches.filter((_, branchIndex) => branchIndex !== index),
        ),
      })
    },
    [applyConfig, parsed.branches],
  )

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index <= 0) {
        return
      }

      const nextBranches = [...parsed.branches]
      const current = nextBranches[index]
      const previous = nextBranches[index - 1]
      if (!current || !previous) {
        return
      }

      nextBranches[index - 1] = current
      nextBranches[index] = previous
      applyConfig({ branches: renumberConditionBranches(nextBranches) })
    },
    [applyConfig, parsed.branches],
  )

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= parsed.branches.length - 1) {
        return
      }

      const nextBranches = [...parsed.branches]
      const current = nextBranches[index]
      const next = nextBranches[index + 1]
      if (!current || !next) {
        return
      }

      nextBranches[index] = next
      nextBranches[index + 1] = current
      applyConfig({ branches: renumberConditionBranches(nextBranches) })
    },
    [applyConfig, parsed.branches],
  )

  const handleAddBranch = useCallback(() => {
    const fallbackPortId = valueInputPorts[0]?.id
    const nextBranches = [
      ...parsed.branches,
      {
        id: `branch-${parsed.branches.length}`,
        label: 'ELSE IF',
        mode: 'visual' as const,
        expression: '',
        conditions: {
          logic: 'and' as const,
          rules: [
            {
              sourcePortId: fallbackPortId ?? 'input-0',
              fieldPath: '',
              operator: 'equals' as const,
              value: '',
            },
          ],
        },
      },
    ]
    applyConfig({ branches: nextBranches })
  }, [applyConfig, parsed.branches, valueInputPorts])

  const handleAddInputPort = useCallback(() => {
    const previousOrder = getConditionPortOrder(inputPorts)
    const nextPorts = buildConditionInputPorts(previousOrder.length + 1, previousOrder, parsed.portLabels)
    applyConfig(parsed, nextPorts)
  }, [applyConfig, inputPorts, parsed])

  const handleMoveInputPort = useCallback(
    (index: number, direction: -1 | 1) => {
      const previousOrder = getConditionPortOrder(inputPorts)
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= previousOrder.length) {
        return
      }

      const nextOrder = [...previousOrder]
      const current = nextOrder[index]
      const target = nextOrder[nextIndex]
      if (!current || !target) {
        return
      }

      nextOrder[index] = target
      nextOrder[nextIndex] = current
      const rewritten = rewriteConditionBranchExpressions(
        parsed.branches,
        previousOrder,
        nextOrder,
      )
      if (!rewritten.ok) {
        notify({ variant: 'error', description: rewritten.error })
        return
      }

      applyConfig(
        { branches: rewritten.branches, portLabels: parsed.portLabels },
        buildConditionInputPorts(nextOrder.length, nextOrder, parsed.portLabels),
      )
    },
    [applyConfig, inputPorts, notify, parsed.branches],
  )

  const handleRemoveInputPort = useCallback(
    (portId: string) => {
      if (valueInputPorts.length <= 1) {
        return
      }

      const ruleStillUsesPort = parsed.branches.some((branch) =>
        branch.conditions.rules.some((rule) => rule.sourcePortId === portId),
      )
      if (ruleStillUsesPort) {
        notify({
          variant: 'error',
          description: '仍有可视化条件引用该输入端口，请先修改条件后再删除。',
        })
        return
      }

      const previousOrder = getConditionPortOrder(inputPorts)
      const nextOrder = previousOrder.filter((currentPortId) => currentPortId !== portId)
      const rewritten = rewriteConditionBranchExpressions(
        parsed.branches,
        previousOrder,
        nextOrder,
      )
      if (!rewritten.ok) {
        notify({ variant: 'error', description: rewritten.error })
        return
      }

      const nextLabels = parsed.portLabels ? { ...parsed.portLabels } : undefined
      if (nextLabels) {
        delete nextLabels[portId]
      }

      applyConfig(
        { branches: rewritten.branches, portLabels: nextLabels },
        buildConditionInputPorts(nextOrder.length, nextOrder, nextLabels),
      )
    },
    [applyConfig, inputPorts, notify, parsed.branches, valueInputPorts.length],
  )

  const handleRenameInputPort = useCallback(
    (portId: string, label: string) => {
      const index = valueInputPorts.findIndex((p) => p.id === portId)
      const defaultLabel = index >= 0 ? `输入 ${index + 1}` : ''
      const nextLabels = { ...(parsed.portLabels ?? {}) }
      if (label && label !== defaultLabel) {
        nextLabels[portId] = label
      } else {
        delete nextLabels[portId]
      }
      const cleanLabels = Object.keys(nextLabels).length > 0 ? nextLabels : undefined
      const previousOrder = getConditionPortOrder(inputPorts)
      applyConfig(
        { ...parsed, portLabels: cleanLabels },
        buildConditionInputPorts(previousOrder.length, previousOrder, cleanLabels),
      )
    },
    [applyConfig, inputPorts, parsed, valueInputPorts],
  )

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">条件分支</span>
        <span className="text-xs text-muted-foreground">
          {parsed.branches.length + 1} 路输出
        </span>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-foreground">输入端口</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              条件左值统一引用输入端口；表达式模式使用 `ports[n]`。
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddInputPort}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>添加输入</span>
          </button>
        </div>

        <div className="space-y-1.5">
          {valueInputPorts.map((port, index) => (
            <div
              key={port.id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={port.label}
                    onChange={(e) => handleRenameInputPort(port.id, e.target.value)}
                    placeholder={`输入 ${index + 1}`}
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-foreground hover:border-border focus:border-primary/50 focus:outline-none"
                  />
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    ports[{index + 1}]
                  </span>
                </div>
                <p className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                  {availablePorts[index]?.dataTypeLabel
                    ? `当前已连接 ${availablePorts[index]?.dataTypeLabel} 输入`
                    : '当前未连接上游，默认按整值比较'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleMoveInputPort(index, -1)}
                disabled={index === 0}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                aria-label="上移输入端口"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleMoveInputPort(index, 1)}
                disabled={index === valueInputPorts.length - 1}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                aria-label="下移输入端口"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveInputPort(port.id)}
                disabled={valueInputPorts.length <= 1}
                className="rounded p-1 text-muted-foreground hover:bg-error/10 hover:text-error disabled:pointer-events-none disabled:opacity-30"
                aria-label="删除输入端口"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {parsed.branches.map((branch, index) => (
          <BranchSection
            key={branch.id}
            branch={branch}
            index={index}
            totalBranches={parsed.branches.length}
            availablePorts={availablePorts}
            onUpdate={handleBranchUpdate}
            onRemove={handleBranchRemove}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddBranch}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        <span>添加 ELSE IF 分支</span>
      </button>

      <div className="rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex min-h-[20px] items-center gap-1.5">
          <span className="inline-flex shrink-0 rounded bg-muted/30 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
            ELSE
          </span>
          <span className="flex-1 text-[10px] text-muted-foreground">
            默认分支，当前面所有条件都不匹配时进入
          </span>
        </div>
      </div>
    </div>
  )
})
