import { memo, useCallback } from 'react'
import { ArrowRightFromLine } from 'lucide-react'
import { useCanvasActions, useCanvasNodes } from '../../stores/canvasStore'
import { buildCompoundOutputPorts } from '../../types/controlFlow.types'
import { useToast } from '@/shared/ui/toast'

interface ResultConfigPanelProps {
  nodeId: string
  parentId?: string
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

function resolveOutputKey(config: Record<string, unknown>): string {
  return typeof config.outputKey === 'string' && config.outputKey.trim().length > 0
    ? config.outputKey
    : 'result'
}

export const ResultConfigPanel = memo(function ResultConfigPanel({
  nodeId,
  parentId,
  config,
  onApply,
}: ResultConfigPanelProps) {
  const nodes = useCanvasNodes()
  const { updateNodeData } = useCanvasActions()
  const { notify } = useToast()
  const outputKey = resolveOutputKey(config)

  const syncParentOutputs = useCallback(
    (nextOutputKey: string) => {
      if (!parentId) {
        return
      }

      const outputKeys = nodes
        .filter((node) => node.parentId === parentId && node.data.nodeType === 'result')
        .map((node) =>
          node.id === nodeId
            ? nextOutputKey
            : resolveOutputKey(node.data.config ?? {}),
        )
        .filter((value, index, items) => items.indexOf(value) === index)

      updateNodeData(parentId, {
        outputPorts: buildCompoundOutputPorts(outputKeys),
      })
    },
    [nodeId, nodes, parentId, updateNodeData],
  )

  const handleOutputKeyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextOutputKey = event.target.value.trim() || 'result'
      const hasConflict = nodes.some(
        (node) =>
          node.parentId === parentId &&
          node.id !== nodeId &&
          node.data.nodeType === 'result' &&
          resolveOutputKey(node.data.config ?? {}) === nextOutputKey,
      )
      if (hasConflict) {
        notify({
          variant: 'error',
          description: `outputKey "${nextOutputKey}" 已被当前 compound 内其他 result 节点占用。`,
        })
        return
      }

      onApply({
        config: {
          ...config,
          outputKey: nextOutputKey,
        },
      })
      syncParentOutputs(nextOutputKey)
    },
    [config, nodeId, nodes, notify, onApply, parentId, syncParentOutputs],
  )

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <ArrowRightFromLine className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">结果节点</span>
      </div>

      <div>
        <label
          htmlFor="result-output-key"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          outputKey
        </label>
        <input
          id="result-output-key"
          type="text"
          value={outputKey}
          onChange={handleOutputKeyChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          父 compound 的外部输出口会直接使用这个 key。
        </p>
      </div>
    </div>
  )
})
