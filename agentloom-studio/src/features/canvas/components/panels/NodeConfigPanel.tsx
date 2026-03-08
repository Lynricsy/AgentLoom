import { memo, useCallback } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  LlmModelConfigPanel,
  parseLlmModelConfig,
  type LlmNodeDataPatch,
} from '@/features/llm'
import type { CanvasNode } from '../../types'
import { getNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { useCanvasActions, useCanvasStore } from '../../stores/canvasStore'
import { McpToolConfigPanel } from './McpToolConfigPanel'
import { KnowledgeBaseConfigPanel } from './KnowledgeBaseConfigPanel'

interface NodeConfigPanelProps {
  className?: string
}

export const NodeConfigPanel = memo(function NodeConfigPanel({
  className,
}: NodeConfigPanelProps) {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId)
  const node = useCanvasStore((s) =>
    s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) ?? null : null
  )

  const { selectNode, updateNodeData } = useCanvasActions()

  const handleClose = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  const handleConfigChange = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedNodeId) return
      updateNodeData(selectedNodeId, patch)
    },
    [selectedNodeId, updateNodeData],
  )

  if (!node) return null

  const nodeType = node.data.nodeType
  const nodeConfig = getNodeTypeConfig(nodeType)

  return (
    <aside
      data-testid="node-config-panel"
      className={cn(
        'flex h-full w-80 flex-col border-l border-border bg-background',
        className,
      )}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{node.data.label}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {nodeConfig.label} 配置
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="关闭配置面板"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <NodeConfigDispatch
          node={node}
          onConfigChange={handleConfigChange}
        />
      </div>
    </aside>
  )
})

interface NodeConfigDispatchProps {
  node: CanvasNode
  onConfigChange: (patch: Record<string, unknown>) => void
}

const NodeConfigDispatch = memo(function NodeConfigDispatch({
  node,
  onConfigChange,
}: NodeConfigDispatchProps) {
  const nodeType = node.data.nodeType

  const handleLlmChange = useCallback(
    (patch: LlmNodeDataPatch) => {
      onConfigChange({
        config: patch.config,
        llmConfigId: patch.llmConfigId,
        parameters: patch.parameters,
        label: patch.label,
      })
    },
    [onConfigChange],
  )

  switch (nodeType) {
    case 'llm-model':
      return (
        <LlmModelConfigPanel
          config={parseLlmModelConfig(node.data.config ?? null)}
          onApply={handleLlmChange}
        />
      )
    case 'mcp-tool':
      return <McpToolConfigPanel data={node.data} />
    case 'knowledge-base':
      return (
        <KnowledgeBaseConfigPanel
          config={node.data.config}
          onApply={onConfigChange}
        />
      )
    default:
      return (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          该节点类型暂无配置项
        </div>
      )
  }
})
