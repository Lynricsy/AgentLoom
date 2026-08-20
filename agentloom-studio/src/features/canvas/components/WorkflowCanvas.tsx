import { memo, useCallback, useMemo, useRef } from 'react'
import { useReactFlow, type Viewport } from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import { useTheme } from '@/shared/hooks/use-theme'
import { LG_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query'
import { useToast } from '@/shared/ui/toast'
import type { WorkflowStatus } from '@/features/workflow'
import { CanvasOverlayLayer } from './CanvasOverlayLayer'
import { CanvasSurface } from './CanvasSurface'
import type { CompatibilityPreviewHandle } from './overlays/CompatibilityPreview'
import { useCanvasDrop } from '../hooks/useCanvasDrop'
import { useCanvasContextMenu } from '../hooks/useCanvasContextMenu'
import { useCanvasKeyboardShortcuts } from '../hooks/useCanvasKeyboardShortcuts'
import { useConnectionInteraction } from '../hooks/useConnectionInteraction'
import { useConnectionValidation } from '../hooks/useConnectionValidation'
import { useExecutionHighlight } from '../hooks/useExecutionHighlight'
import { collectCollapsedCompoundDescendantIds } from '../lib/collapsedCompoundNodes'
import {
  useSelectedNodeIds,
  useCanvasActions,
  useCanvasEdges,
  useCanvasNodes,
  useCanvasStore,
} from '../stores/canvasStore'
import type { CanvasEdge, CanvasNode } from '../types'

interface WorkflowCanvasProps {
  className?: string
  workflowStatus?: WorkflowStatus
}

export const WorkflowCanvas = memo(function WorkflowCanvas({
  className,
  workflowStatus = 'draft',
}: WorkflowCanvasProps) {
  const nodes = useCanvasNodes()
  const edges = useCanvasEdges()
  const viewport = useCanvasStore((state) => state.viewport)
  const selectedNodeIds = useSelectedNodeIds()
  const selectedNodeCount = useCanvasStore((state) =>
    state.selectedNodeIds.size > 0
      ? state.selectedNodeIds.size
      : state.selectedNodeId
        ? 1
        : 0,
  )
  const {
    clearSelection,
    commitViewport,
    createConnection,
    deleteSelectedNode,
    deleteSelectedNodes,
    onEdgesChange,
    onNodesChange,
    openFieldMapping,
    selectEdge,
    selectNode,
    setViewport,
    toggleSearch,
  } = useCanvasActions()
  const { notify } = useToast()
  const { resolvedTheme } = useTheme()
  const reactFlowInstance = useReactFlow<CanvasNode, CanvasEdge>()
  const { onDragOver, onDrop } = useCanvasDrop(reactFlowInstance)
  const isDesktopViewport = useMediaQuery(LG_QUERY)
  /** 小屏（<lg）只读浏览：保留平移 / 缩放，关闭全部编辑入口 */
  const isMobileReadOnly = !isDesktopViewport
  const isReadOnly = workflowStatus === 'archived'
  /**
   * 归档与小屏都禁止编辑；但视口写入只受归档态限制——
   * `viewport` 是受控 prop，小屏若一并冻结就连平移缩放都做不了。
   */
  const isEditingDisabled = isReadOnly || isMobileReadOnly
  const hiddenCompoundNodeIds = useMemo(
    () => collectCollapsedCompoundDescendantIds(nodes),
    [nodes],
  )
  const renderedNodes = useMemo(
    () =>
      nodes.map((node) =>
        hiddenCompoundNodeIds.has(node.id) || node.hidden
          ? { ...node, hidden: true }
          : node,
      ),
    [hiddenCompoundNodeIds, nodes],
  )
  const renderedEdges = useMemo(
    () =>
      edges.map((edge) =>
        hiddenCompoundNodeIds.has(edge.source) ||
        hiddenCompoundNodeIds.has(edge.target) ||
        edge.hidden
          ? { ...edge, hidden: true }
          : edge,
      ),
    [edges, hiddenCompoundNodeIds],
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<CompatibilityPreviewHandle>(null)

  useExecutionHighlight({ containerRef, edges: renderedEdges })

  const { activeConnection, previewState, onConnectStart, onConnectEnd } =
    useConnectionInteraction({
      containerRef,
      previewRef,
      nodes,
      edges,
      isEditingDisabled,
    })

  const { onConnect, isValidConnection } = useConnectionValidation({
    nodes,
    edges,
    isEditingDisabled,
    createConnection,
  })

  useCanvasKeyboardShortcuts({
    isEditingDisabled,
    toggleSearch,
    deleteSelectedNode,
    deleteSelectedNodes,
  })

  const {
    contextMenuState,
    closeContextMenu,
    onNodeContextMenu,
    onPaneContextMenu,
  } = useCanvasContextMenu({ isEditingDisabled, selectedNodeIds, selectNode })

  const onViewportChange = useCallback(
    (nextViewport: Viewport) => {
      if (isReadOnly) {
        return
      }

      setViewport(nextViewport)
    },
    [isReadOnly, setViewport],
  )

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: CanvasNode) => {
      closeContextMenu()
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }

      selectNode(node.id)
    },
    [closeContextMenu, selectNode],
  )

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: CanvasEdge) => {
      closeContextMenu()
      selectEdge(edge.id)
      if (!isEditingDisabled) {
        openFieldMapping(edge.id)
      }
    },
    [closeContextMenu, isEditingDisabled, openFieldMapping, selectEdge],
  )

  const onPaneClick = useCallback(() => {
    closeContextMenu()
    clearSelection()
  }, [clearSelection, closeContextMenu])

  const handleEncapsulate = useCallback(() => {
    notify({ description: '封装为块功能将在下一步实现', variant: 'warning' })
  }, [notify])

  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      if (isEditingDisabled) {
        return
      }

      commitViewport(nextViewport)
    },
    [commitViewport, isEditingDisabled],
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (isEditingDisabled) {
        event.preventDefault()
        return
      }

      onDragOver(event)
    },
    [isEditingDisabled, onDragOver],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (isEditingDisabled) {
        event.preventDefault()
        return
      }

      onDrop(event)
    },
    [isEditingDisabled, onDrop],
  )

  return (
    <div ref={containerRef} className={cn(className, 'focus:outline-none')}>
      <CanvasSurface
        nodes={renderedNodes}
        edges={renderedEdges}
        viewport={viewport}
        colorMode={resolvedTheme}
        isEditingDisabled={isEditingDisabled}
        isMobileReadOnly={isMobileReadOnly}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onViewportChange={onViewportChange}
        onMoveEnd={onMoveEnd}
      />
      <CanvasOverlayLayer
        previewRef={previewRef}
        previewState={previewState}
        activeConnection={activeConnection}
        contextMenuState={contextMenuState}
        selectedNodeCount={selectedNodeCount}
        onCloseContextMenu={closeContextMenu}
        onEncapsulate={handleEncapsulate}
      />
    </div>
  )
})
