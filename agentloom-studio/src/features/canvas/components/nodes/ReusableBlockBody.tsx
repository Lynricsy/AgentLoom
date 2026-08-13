import { memo } from 'react'
import { ChevronDown, ChevronRight, Package } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import type { BlockDefinition, BlockNodeData, CanvasNodeData } from '../../types'
import { useCanvasActions } from '../../stores/canvasStore'
import { usePreviewMode } from '../PreviewModeContext'
import { NodeBadge } from '../shared/NodeBadge'

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

const MAX_VISIBLE_INTERNAL_NODES = 4

export const ReusableBlockBody = memo(function ReusableBlockBody({
  nodeId,
  data,
}: ReusableBlockBodyProps) {
  const previewMode = usePreviewMode()
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
      {/* Header row: icon + badges */}
      <div className="flex items-center gap-1">
        <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <NodeBadge variant="status" color="muted">
          {internalNodeCount} 节点 / {internalEdgeCount} 连线
        </NodeBadge>
        {(inputCount > 0 || outputCount > 0) && (
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            {inputCount}入 / {outputCount}出
          </span>
        )}
      </div>

      {/* Block name + description */}
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">{data.blockName}</p>
        {data.description && (
          <p className="truncate text-muted-foreground">{data.description}</p>
        )}
      </div>

      {/* Toggle button：写编辑器 store，预览态不提供 */}
      {previewMode ? null : (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => updateNodeData(nodeId, { isExpanded: !data.isExpanded })}
            aria-label={toggleLabel}
          >
            {data.isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{toggleLabel}</span>
          </Button>
        </div>
      )}

      {/* Expanded preview (limited to MAX_VISIBLE_INTERNAL_NODES) */}
      {data.isExpanded ? (
        <div
          data-testid="reusable-block-expanded-view"
          className="flex flex-col gap-2 rounded-lg border border-dashed border-border/70 bg-background/70 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-foreground">内部图预览</span>
            <span className="text-[11px] text-muted-foreground">只读</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {data.blockDefinition.nodes
              .slice(0, MAX_VISIBLE_INTERNAL_NODES)
              .map((node) => (
                <NodeBadge key={node.id} variant="info" color="default">
                  {node.data.label}
                </NodeBadge>
              ))}
            {data.blockDefinition.nodes.length > MAX_VISIBLE_INTERNAL_NODES ? (
              <NodeBadge variant="info" color="muted">
                +{data.blockDefinition.nodes.length - MAX_VISIBLE_INTERNAL_NODES} more
              </NodeBadge>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
})
