import { memo, useCallback, useMemo } from 'react'
import { ChevronDown, ChevronUp, GitBranch, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useToast } from '@/shared/ui/toast'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { fadeInUp } from '@/shared/lib/motion'
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

  const summary =
    branch.mode === 'expression'
      ? branch.expression || '未配置表达式'
      : `${branch.conditions.rules.length} 条条件`

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <span
          className={cn(
            'inline-flex shrink-0 rounded-xs px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider',
            branch.label === 'IF'
              ? 'bg-info/15 text-info'
              : 'bg-warning/15 text-warning',
          )}
        >
          {branch.label}
        </span>

        <span
          className={cn(
            'min-w-0 flex-1 truncate text-2xs text-muted-foreground',
            branch.mode === 'expression' && branch.expression && 'font-mono',
          )}
          title={summary}
        >
          {summary}
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onMoveUp(index)}
            disabled={isFirst}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="上移分支"
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onMoveDown(index)}
            disabled={isLast}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="下移分支"
          >
            <ChevronDown />
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onRemove(index)}
              className="text-muted-foreground hover:bg-error/10 hover:text-error"
              aria-label="删除分支"
            >
              <Trash2 />
            </Button>
          )}
        </div>
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
    </Card>
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
        <GitBranch className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">条件分支</span>
        <span className="text-xs text-muted-foreground">
          {parsed.branches.length + 1} 路输出
        </span>
      </div>

      <Card className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">输入端口</p>
            <p className="mt-1 text-xs text-muted-foreground">
              条件左值统一引用输入端口；表达式模式使用{' '}
              <code className="rounded-xs bg-muted px-1 font-mono">ports[n]</code>。
            </p>
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={handleAddInputPort}
            className="shrink-0"
          >
            <Plus />
            <span>添加输入</span>
          </Button>
        </div>

        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {valueInputPorts.map((port, index) => (
              <motion.div
                key={port.id}
                layout
                {...fadeInUp}
                className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={port.label}
                      onChange={(e) => handleRenameInputPort(port.id, e.target.value)}
                      placeholder={`输入 ${index + 1}`}
                      className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1 text-xs font-medium shadow-none hover:border-border"
                    />
                    <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                      ports[{index + 1}]
                    </span>
                  </div>
                  <p className="truncate px-1 text-2xs text-muted-foreground">
                    {availablePorts[index]?.dataTypeLabel
                      ? `当前已连接 ${availablePorts[index]?.dataTypeLabel} 输入`
                      : '当前未连接上游，默认按整值比较'}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleMoveInputPort(index, -1)}
                  disabled={index === 0}
                  className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="上移输入端口"
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleMoveInputPort(index, 1)}
                  disabled={index === valueInputPorts.length - 1}
                  className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="下移输入端口"
                >
                  <ChevronDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleRemoveInputPort(port.id)}
                  disabled={valueInputPorts.length <= 1}
                  className="shrink-0 text-muted-foreground hover:bg-error/10 hover:text-error disabled:opacity-30"
                  aria-label="删除输入端口"
                >
                  <Trash2 />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Card>

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {parsed.branches.map((branch, index) => (
            <motion.div key={branch.id} layout {...fadeInUp}>
              <BranchSection
                branch={branch}
                index={index}
                totalBranches={parsed.branches.length}
                availablePorts={availablePorts}
                onUpdate={handleBranchUpdate}
                onRemove={handleBranchRemove}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleAddBranch}
        className="w-full border-dashed font-normal text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      >
        <Plus />
        <span>添加 ELSE IF 分支</span>
      </Button>

      <Card className="px-3 py-2">
        <div className="flex min-h-5 items-center gap-2">
          <span className="inline-flex shrink-0 rounded-xs bg-muted px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            ELSE
          </span>
          <span className="min-w-0 flex-1 text-2xs text-muted-foreground">
            默认分支，当前面所有条件都不匹配时进入
          </span>
        </div>
      </Card>
    </div>
  )
})
