import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { useReactFlow, type Viewport } from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import { useTheme } from '@/shared/hooks/use-theme'
import { LG_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query'
import type { WorkflowStatus } from '@/features/workflow'
import { BlockCreateDialog } from './BlockCreateDialog'
import { CanvasOverlayLayer } from './CanvasOverlayLayer'
import { CanvasSurface } from './CanvasSurface'
import {
  SmartEdgeActionsContext,
  type SmartEdgeActions,
} from './edges/SmartEdgeActionsContext'
import type { CompatibilityPreviewHandle } from './overlays/CompatibilityPreview'
import { useCanvasDrop } from '../hooks/useCanvasDrop'
import { useCanvasContextMenu } from '../hooks/useCanvasContextMenu'
import { useCanvasKeyboardShortcuts } from '../hooks/useCanvasKeyboardShortcuts'
import { useEncapsulateSelection } from '../hooks/useEncapsulateSelection'
import { useConnectionInteraction } from '../hooks/useConnectionInteraction'
import { useConnectionValidation } from '../hooks/useConnectionValidation'
import { useExecutionHighlight } from '../hooks/useExecutionHighlight'
import { collectCollapsedCompoundDescendantIds } from '../lib/collapsedCompoundNodes'
import { getTypeEngineService } from '../lib/typeEngine/service'
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
    autoLayout,
    clearSelection,
    commitViewport,
    createConnection,
    deleteSelectedEdge,
    deleteSelectedNode,
    deleteSelectedNodes,
    onEdgesChange,
    onNodesChange,
    openFieldMapping,
    redo,
    selectEdge,
    selectNode,
    setViewport,
    toggleSearch,
    undo,
  } = useCanvasActions()
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

  /** 画布挂载即预热 worker + WASM，避免首次连线时才冷启动（warmup 内部已吞掉失败） */
  useEffect(() => {
    void getTypeEngineService().warmup()
  }, [])

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
    deleteSelectedEdge,
    undo,
    redo,
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

  const encapsulation = useEncapsulateSelection()
  // Dialog 退场期间 analysis 已被清空：保留最近一次分析结果，让 Dialog 常驻挂载以播放退场动画
  const lastAnalysisRef = useRef(encapsulation.analysis)
  if (encapsulation.analysis) {
    lastAnalysisRef.current = encapsulation.analysis
  }
  const dialogAnalysis = encapsulation.analysis ?? lastAnalysisRef.current

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

  /** 只读（归档 / 小屏）时不注入，边上不出现删除与字段映射入口 */
  const edgeActions = useMemo<SmartEdgeActions | null>(
    () =>
      isEditingDisabled
        ? null
        : {
            removeEdge: (edgeId) =>
              onEdgesChange([{ type: 'remove', id: edgeId }]),
            openFieldMapping,
          },
    [isEditingDisabled, onEdgesChange, openFieldMapping],
  )

  return (
    <div ref={containerRef} className={cn(className, 'focus:outline-none')}>
      <SmartEdgeActionsContext.Provider value={edgeActions}>
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
          onAutoLayout={isEditingDisabled ? undefined : autoLayout}
        />
      </SmartEdgeActionsContext.Provider>
      <CanvasOverlayLayer
        previewRef={previewRef}
        previewState={previewState}
        activeConnection={activeConnection}
        contextMenuState={contextMenuState}
        selectedNodeCount={selectedNodeCount}
        onCloseContextMenu={closeContextMenu}
        onEncapsulate={encapsulation.openEncapsulation}
      />
      {dialogAnalysis ? (
        <BlockCreateDialog
          open={encapsulation.analysis !== null}
          onOpenChange={encapsulation.onOpenChange}
          analysis={dialogAnalysis}
          onConfirm={encapsulation.onConfirm}
        />
      ) : null}
    </div>
  )
})
