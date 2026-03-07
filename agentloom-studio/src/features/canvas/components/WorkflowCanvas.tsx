import { memo, useCallback } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import { CanvasNodeShell } from './CanvasNodeShell'
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

const nodeTypes: NodeTypes = {
  agent: CanvasNodeShell,
  tool: CanvasNodeShell,
  trigger: CanvasNodeShell,
  knowledge: CanvasNodeShell,
  output: CanvasNodeShell,
  control: CanvasNodeShell,
}

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select, [contenteditable="true"]') !== null)
  )
}

export const WorkflowCanvas = memo(function WorkflowCanvas({
  className,
}: WorkflowCanvasProps) {
  const nodes = useCanvasNodes()
  const edges = useCanvasEdges()
  const viewport = useCanvasStore((state) => state.viewport)
  const {
    commitViewport,
    deleteSelectedNode,
    onEdgesChange,
    onNodesChange,
    selectNode,
    setViewport,
  } = useCanvasActions()
  const reactFlowInstance = useReactFlow<CanvasNode, CanvasEdge>()
  const { onDragOver, onDrop } = useCanvasDrop(reactFlowInstance)

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
      deleteSelectedNode()
    },
    [deleteSelectedNode]
  )

  const handlePointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isEditableTarget(event.target)) {
        return
      }

      event.currentTarget.focus()
    },
    []
  )

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

  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      commitViewport(nextViewport)
    },
    [commitViewport]
  )

  return (
    <div
      className={cn(className, 'focus:outline-none')}
      tabIndex={0}
      aria-label="Workflow Canvas"
      onKeyDownCapture={handleKeyDown}
      onPointerDownCapture={handlePointerDownCapture}
    >
      <ReactFlow<CanvasNode, CanvasEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        viewport={viewport}
        onViewportChange={onViewportChange}
        onMoveEnd={onMoveEnd}
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
