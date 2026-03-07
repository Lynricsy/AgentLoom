import { memo, useCallback, useEffect } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Viewport,
} from '@xyflow/react'
import { NODE_CATEGORIES } from './nodeCategories'
import { useCanvasDrop } from '../hooks/useCanvasDrop'
import {
  useCanvasActions,
  useCanvasEdges,
  useCanvasNodes,
  useCanvasStore,
} from '../stores/canvasStore'
import type { CanvasEdge, CanvasNode } from '../types'

interface WorkflowCanvasProps {
  className?: string
}

export const WorkflowCanvas = memo(function WorkflowCanvas({
  className,
}: WorkflowCanvasProps) {
  const nodes = useCanvasNodes()
  const edges = useCanvasEdges()
  const viewport = useCanvasStore((state) => state.viewport)
  const {
    deleteSelectedNode,
    onEdgesChange,
    onNodesChange,
    selectNode,
    setViewport,
  } = useCanvasActions()
  const reactFlowInstance = useReactFlow<CanvasNode, CanvasEdge>()
  const { onDragOver, onDrop } = useCanvasDrop(reactFlowInstance)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        deleteSelectedNode()
      }
    },
    [deleteSelectedNode]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  const onViewportChange = useCallback(
    (nextViewport: Viewport) => {
      setViewport(nextViewport)
    },
    [setViewport]
  )

  const getMiniMapNodeColor = useCallback((node: CanvasNode) => {
    return NODE_CATEGORIES[node.data.category]?.color ?? 'var(--color-surface-elevated)'
  }, [])

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: CanvasNode) => {
      selectNode(node.id)
    },
    [selectNode]
  )

  return (
    <div className={className}>
      <ReactFlow<CanvasNode, CanvasEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        viewport={viewport}
        onViewportChange={onViewportChange}
        fitView
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        panOnScroll
        zoomOnScroll
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-surface-elevated !border-border !shadow-lg"
        />
        <MiniMap
          className="!bg-surface !border-border"
          nodeColor={getMiniMapNodeColor}
          maskColor="rgba(0, 0, 0, 0.6)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  )
})
