import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Connection,
  type OnConnectStartParams,
  type OnEdgesChange,
  type OnNodesChange,
  type Viewport,
} from '@xyflow/react'
import type { ResolvedTheme } from '@/shared/hooks/use-theme'
import { CanvasMiniMap } from './navigation/CanvasMiniMap'
import {
  WORKFLOW_EDGE_TYPES,
  WORKFLOW_NODE_TYPES,
} from './workflowFlowRegistry'
import type { CanvasEdge, CanvasNode } from '../types'

export interface CanvasSurfaceProps {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport
  colorMode: ResolvedTheme
  isEditingDisabled: boolean
  isMobileReadOnly: boolean
  onNodesChange: OnNodesChange<CanvasNode>
  onEdgesChange: OnEdgesChange<CanvasEdge>
  onConnect: (connection: Connection) => void | Promise<void>
  isValidConnection: (connectionOrEdge: Connection | CanvasEdge) => boolean
  onConnectStart: (
    event: MouseEvent | TouchEvent,
    params: OnConnectStartParams,
  ) => void
  onConnectEnd: () => void
  onNodeClick: (event: React.MouseEvent, node: CanvasNode) => void
  onNodeContextMenu: (event: React.MouseEvent, node: CanvasNode) => void
  onEdgeClick: (event: React.MouseEvent, edge: CanvasEdge) => void
  onPaneClick: () => void
  onPaneContextMenu: (
    event: MouseEvent | React.MouseEvent<Element, MouseEvent>,
  ) => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onViewportChange: (viewport: Viewport) => void
  onMoveEnd: (
    event: MouseEvent | TouchEvent | null,
    viewport: Viewport,
  ) => void
}

/**
 * React Flow 画布本体：节点 / 边渲染、交互开关与背景装饰。
 * 归档或小屏只读时关闭编辑类交互，但视口仍然受控可平移缩放。
 */
export function CanvasSurface({
  nodes,
  edges,
  viewport,
  colorMode,
  isEditingDisabled,
  isMobileReadOnly,
  onNodesChange,
  onEdgesChange,
  onConnect,
  isValidConnection,
  onConnectStart,
  onConnectEnd,
  onNodeClick,
  onNodeContextMenu,
  onEdgeClick,
  onPaneClick,
  onPaneContextMenu,
  onDragOver,
  onDrop,
  onViewportChange,
  onMoveEnd,
}: CanvasSurfaceProps) {
  return (
    <ReactFlow<CanvasNode, CanvasEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={WORKFLOW_NODE_TYPES}
      edgeTypes={WORKFLOW_EDGE_TYPES}
      defaultEdgeOptions={{ type: 'smart' }}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onNodeClick={onNodeClick}
      onNodeContextMenu={onNodeContextMenu}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      viewport={viewport}
      onViewportChange={onViewportChange}
      onMoveEnd={onMoveEnd}
      nodesDraggable={!isEditingDisabled}
      nodesConnectable={!isEditingDisabled}
      elementsSelectable={!isMobileReadOnly}
      connectOnClick={!isEditingDisabled}
      deleteKeyCode={null}
      multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
      selectionKeyCode="Shift"
      panOnScroll
      zoomOnScroll
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
      colorMode={colorMode}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={2}
        color="var(--color-border)"
      />
      <Controls
        showInteractive={false}
        className="!bg-surface-elevated !border-border !shadow-lg"
      />
      <CanvasMiniMap />
    </ReactFlow>
  )
}
