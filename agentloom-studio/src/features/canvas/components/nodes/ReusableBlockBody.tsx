import { memo } from 'react'
import { ChevronDown, Package } from 'lucide-react'
import { Collapse } from '@/shared/components/collapse/Collapse'
import { cn } from '@/shared/lib/utils'
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
        <Package className="size-3.5 shrink-0 text-muted-foreground" />
        <NodeBadge variant="status" color="muted">
          {internalNodeCount} 节点 / {internalEdgeCount} 连线
        </NodeBadge>
        {(inputCount > 0 || outputCount > 0) && (
          <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
            {inputCount}入 / {outputCount}出
          </span>
        )}
      </div>

      {/* Block name + description */}
      <div className="flex flex-col gap-1">
        <p className="truncate font-medium text-foreground" title={data.blockName}>
          {data.blockName}
        </p>
        {data.description && (
          <p className="truncate text-muted-foreground">{data.description}</p>
        )}
      </div>

      {/* Toggle button：写编辑器 store，预览态不提供 */}
      {previewMode ? null : (
        <div className="flex items-center justify-end">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => updateNodeData(nodeId, { isExpanded: !data.isExpanded })}
            aria-label={toggleLabel}
            aria-expanded={data.isExpanded}
          >
            <ChevronDown
              className={cn('transition-transform duration-150', !data.isExpanded && '-rotate-90')}
            />
            <span>{toggleLabel}</span>
          </Button>
        </div>
      )}

      {/* Expanded preview (limited to MAX_VISIBLE_INTERNAL_NODES) */}
      <Collapse open={Boolean(data.isExpanded)}>
        <div
          data-testid="reusable-block-expanded-view"
          className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs font-medium text-foreground">内部图预览</span>
            <span className="text-2xs text-muted-foreground">只读</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {data.blockDefinition.nodes
              .slice(0, MAX_VISIBLE_INTERNAL_NODES)
              .map((node) => (
                <NodeBadge key={node.id} variant="info" color="default" className="max-w-32">
                  <span className="truncate" title={node.data.label}>
                    {node.data.label}
                  </span>
                </NodeBadge>
              ))}
            {data.blockDefinition.nodes.length > MAX_VISIBLE_INTERNAL_NODES ? (
              <NodeBadge variant="info" color="muted">
                +{data.blockDefinition.nodes.length - MAX_VISIBLE_INTERNAL_NODES}
              </NodeBadge>
            ) : null}
          </div>
        </div>
      </Collapse>
    </div>
  )
})
