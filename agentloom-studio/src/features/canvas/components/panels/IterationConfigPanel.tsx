import { memo, useCallback, useMemo } from 'react'
import { ChevronDown, ChevronUp, ListOrdered, Plus, Trash2 } from 'lucide-react'
import { useCanvasActions, useCanvasNodes } from '../../stores/canvasStore'
import type { PortDefinition } from '../../types/nodeTypeRegistry'
import {
  buildIterationInputPorts,
  buildIterationStartOutputPorts,
  COMPOUND_EXTRA_INPUT_PREFIX,
  createDefaultIterationNodeConfig,
  createDefaultIterationStartNodeConfig,
  getCompoundExtraInputPortIds,
} from '../../types/controlFlow.types'

interface IterationConfigPanelProps {
  nodeId: string
  inputPorts: PortDefinition[]
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

function parseIterationConfig(config: Record<string, unknown>) {
  return {
    ...createDefaultIterationNodeConfig(),
    ...(config ?? {}),
  }
}

function nextExtraInputId(inputPorts: readonly PortDefinition[]): string {
  const maxIndex = inputPorts.reduce((currentMax, port) => {
    if (!port.id.startsWith(COMPOUND_EXTRA_INPUT_PREFIX)) {
      return currentMax
    }

    const suffix = Number.parseInt(
      port.id.slice(COMPOUND_EXTRA_INPUT_PREFIX.length),
      10,
    )
    return Number.isFinite(suffix) ? Math.max(currentMax, suffix) : currentMax
  }, -1)

  return `${COMPOUND_EXTRA_INPUT_PREFIX}${maxIndex + 1}`
}

export const IterationConfigPanel = memo(function IterationConfigPanel({
  nodeId,
  inputPorts,
  config,
  onApply,
}: IterationConfigPanelProps) {
  const nodes = useCanvasNodes()
  const { updateNodeData } = useCanvasActions()
  const parsed = useMemo(() => parseIterationConfig(config), [config])
  const extraInputIds = useMemo(
    () => getCompoundExtraInputPortIds(inputPorts),
    [inputPorts],
  )

  const syncStartNodePorts = useCallback(
    (nextExtraInputIds: readonly string[]) => {
      const startNode = nodes.find(
        (node) => node.parentId === nodeId && node.data.nodeType === 'iteration-start',
      )
      if (!startNode) {
        return
      }

      updateNodeData(startNode.id, {
        outputPorts: buildIterationStartOutputPorts(
          nextExtraInputIds,
          {
            ...createDefaultIterationStartNodeConfig(),
            ...(startNode.data.config ?? {}),
          },
        ),
      })
    },
    [nodeId, nodes, updateNodeData],
  )

  const handleOutputModeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onApply({
        config: {
          ...parsed,
          outputMode: event.target.value,
        },
      })
    },
    [onApply, parsed],
  )

  const handleCollapsedChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onApply({
        config: {
          ...parsed,
          isCollapsed: event.target.checked,
        },
      })
    },
    [onApply, parsed],
  )

  const handleAddInputPort = useCallback(() => {
    const nextExtraInputIds = [...extraInputIds, nextExtraInputId(inputPorts)]
    onApply({
      inputPorts: buildIterationInputPorts(nextExtraInputIds),
      config: parsed,
    })
    syncStartNodePorts(nextExtraInputIds)
  }, [extraInputIds, inputPorts, onApply, parsed, syncStartNodePorts])

  const handleMoveInputPort = useCallback(
    (index: number, direction: -1 | 1) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= extraInputIds.length) {
        return
      }

      const nextExtraInputIds = [...extraInputIds]
      const current = nextExtraInputIds[index]
      const target = nextExtraInputIds[nextIndex]
      if (!current || !target) {
        return
      }

      nextExtraInputIds[index] = target
      nextExtraInputIds[nextIndex] = current
      onApply({
        inputPorts: buildIterationInputPorts(nextExtraInputIds),
        config: parsed,
      })
      syncStartNodePorts(nextExtraInputIds)
    },
    [extraInputIds, onApply, parsed, syncStartNodePorts],
  )

  const handleRemoveInputPort = useCallback(
    (portId: string) => {
      const nextExtraInputIds = extraInputIds.filter((currentId) => currentId !== portId)
      onApply({
        inputPorts: buildIterationInputPorts(nextExtraInputIds),
        config: parsed,
      })
      syncStartNodePorts(nextExtraInputIds)
    },
    [extraInputIds, onApply, parsed, syncStartNodePorts],
  )

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <ListOrdered className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">迭代容器</span>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-foreground">额外输入端口</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              这些输入会同步映射到内部 `iteration-start` 节点输出。
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

        {extraInputIds.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">当前没有额外输入端口。</p>
        ) : (
          <div className="space-y-1.5">
            {extraInputIds.map((portId, index) => (
              <div
                key={portId}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">
                    输入 {index + 1}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {portId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleMoveInputPort(index, -1)}
                  disabled={index === 0}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveInputPort(index, 1)}
                  disabled={index === extraInputIds.length - 1}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveInputPort(portId)}
                  className="rounded p-1 text-muted-foreground hover:bg-error/10 hover:text-error"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label
          htmlFor="iteration-output-mode"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          输出模式
        </label>
        <select
          id="iteration-output-mode"
          value={parsed.outputMode}
          onChange={handleOutputModeChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="none">纯控制流</option>
          <option value="collect-array">收集为数组</option>
          <option value="last">保留最后一次结果</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={parsed.isCollapsed}
          onChange={handleCollapsedChange}
          className="h-4 w-4 rounded border border-border"
        />
        <span>保存为收起态</span>
      </label>
    </div>
  )
})
