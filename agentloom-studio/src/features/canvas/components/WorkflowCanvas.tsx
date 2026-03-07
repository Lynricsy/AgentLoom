import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import { CanvasNodeShell } from './CanvasNode'
import { SmartEdge } from './edges/SmartEdge'
import { CompatibilityPreview } from './overlays/CompatibilityPreview'
import { ConnectionStateOverlay } from './overlays/ConnectionStateOverlay'
import { NODE_CATEGORIES } from './nodeCategories'
import { useCanvasDrop } from '../hooks/useCanvasDrop'
import {
  useCanvasActions,
  useCanvasEdges,
  useCanvasNodes,
  useCanvasStore,
} from '../stores/canvasStore'
import type { CanvasEdge, CanvasNode, VisualCompatibilityLevel } from '../types'

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

const edgeTypes: EdgeTypes = {
  smart: SmartEdge,
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
    openFieldMapping,
    selectEdge,
    selectNode,
    setViewport,
  } = useCanvasActions()
  const reactFlowInstance = useReactFlow<CanvasNode, CanvasEdge>()
  const { onDragOver, onDrop } = useCanvasDrop(reactFlowInstance)

  const [connectionActive, setConnectionActive] = useState(false)
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const [previewLevel, setPreviewLevel] = useState<VisualCompatibilityLevel>('checking')
  const containerRef = useRef<HTMLDivElement>(null)

  const onConnectStart = useCallback(() => {
    setConnectionActive(true)
    setPreviewLevel('checking')
  }, [])

  const onConnectEnd = useCallback(() => {
    setConnectionActive(false)
  }, [])

  useEffect(() => {
    if (!connectionActive) return
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [connectionActive])

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

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
      deleteSelectedNode()
    }

    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [deleteSelectedNode])

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

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: CanvasEdge) => {
      selectEdge(edge.id)
      openFieldMapping(edge.id)
    },
    [selectEdge, openFieldMapping]
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
    selectEdge(null)
  }, [selectNode, selectEdge])

  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      commitViewport(nextViewport)
    },
    [commitViewport]
  )

  return (
    <div
      ref={containerRef}
      className={cn(className, 'focus:outline-none')}
      onKeyDownCapture={handleKeyDown}
    >
      <ReactFlow<CanvasNode, CanvasEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'smart' }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
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
      <CompatibilityPreview
        visible={connectionActive}
        visualLevel={previewLevel}
        x={cursorPos.x}
        y={cursorPos.y}
        reasonKey={null}
        metadata={{}}
      />
      <ConnectionStateOverlay
        active={connectionActive}
        cursor={cursorPos}
        sourceHandle={null}
        compatibleTargets={[]}
        incompatibleTargets={[]}
        label={null}
      />
    </div>
  )
})
