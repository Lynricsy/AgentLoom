import { memo } from 'react'
import { ChevronDown, ChevronRight, Package } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import type { BlockDefinition, BlockNodeData, CanvasNodeData } from '../../types'
import { useCanvasActions } from '../../stores/canvasStore'

interface ReusableBlockBodyProps {
  nodeId: string
  data: CanvasNodeData
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBlockDefinition(value: unknown): value is BlockDefinition {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    Array.isArray(value.inputPorts) &&
    Array.isArray(value.outputPorts)
  )
}

function isBlockNodeData(data: CanvasNodeData): data is BlockNodeData {
  return (
    data.nodeType === 'reusable-block' &&
    typeof data.blockName === 'string' &&
    typeof data.isExpanded === 'boolean' &&
    isBlockDefinition(data.blockDefinition)
  )
}

export const ReusableBlockBody = memo(function ReusableBlockBody({
  nodeId,
  data,
}: ReusableBlockBodyProps) {
  const { updateNodeData } = useCanvasActions()

  if (!isBlockNodeData(data)) {
    return null
  }

  const inputCount = Array.isArray(data.inputPorts) ? data.inputPorts.length : 0
  const outputCount = Array.isArray(data.outputPorts) ? data.outputPorts.length : 0
  const internalNodeCount = data.blockDefinition.nodes.length
  const internalEdgeCount = data.blockDefinition.edges.length
  const toggleLabel = data.isExpanded ? '收起内部图' : '展开内部图'

  return (
    <div className="flex flex-col gap-2" data-testid="reusable-block-body">
      <div className="flex items-center gap-2">
        <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-foreground">
          Reusable Block
        </span>
        {(inputCount > 0 || outputCount > 0) && (
          <span className="ml-auto shrink-0 text-[10px] text-muted">{inputCount}入 / {outputCount}出</span>
        )}
      </div>

      <div className="space-y-1">
        <p className="font-medium text-foreground">{data.blockName}</p>
        <p className="text-[10px] text-muted-foreground">
          {internalNodeCount} 个内部节点 · {internalEdgeCount} 条内部连线
        </p>
        {data.description && <p className="truncate text-xs text-muted-foreground">{data.description}</p>}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted">{internalNodeCount} 个内部节点</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[10px]"
          onClick={() => updateNodeData(nodeId, { isExpanded: !data.isExpanded })}
          aria-label={toggleLabel}
        >
          {data.isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>{toggleLabel}</span>
        </Button>
      </div>

      {data.isExpanded ? (
        <div
          data-testid="reusable-block-expanded-view"
          className="space-y-2 rounded-lg border border-dashed border-border/70 bg-background/70 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-foreground">内部图预览</span>
            <span className="text-[10px] text-muted-foreground">只读</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.blockDefinition.nodes.map((node) => (
              <span
                key={node.id}
                className="rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-[10px] text-foreground"
              >
                {node.data.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
})
