import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeTypes,
  type NodeTypes,
  type OnConnectStartParams,
  type Viewport,
} from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import { useToast } from '@/shared/ui/toast'
import { CanvasNodeShell } from './CanvasNode'
import { SmartEdge } from './edges/SmartEdge'
import { CanvasMiniMap } from './navigation/CanvasMiniMap'
import { NodeInfoCard } from './overlays/NodeInfoCard'
import {
  CompatibilityPreview,
  type CompatibilityPreviewHandle,
} from './overlays/CompatibilityPreview'
import {
  ConnectionStateOverlay,
  type OverlayHandleSnapshot,
} from './overlays/ConnectionStateOverlay'
import { CanvasSearch } from './toolbar/CanvasSearch'
import { useCanvasDrop } from '../hooks/useCanvasDrop'
import { evaluateConnection } from '../lib/connectionCompatibility'
import { validateDag } from '../lib/dagValidator'
import {
  useCanvasActions,
  useCanvasEdges,
  useCanvasNodes,
  useCanvasStore,
} from '../stores/canvasStore'
import type { CanvasEdge, CanvasEdgeData, CanvasNode } from '../types'

interface WorkflowCanvasProps {
  className?: string
}

interface ActiveConnectionState {
  sourceHandle: OverlayHandleSnapshot
  compatibleTargets: OverlayHandleSnapshot[]
  incompatibleTargets: OverlayHandleSnapshot[]
}

type PreviewState = Pick<
  CanvasEdgeData,
  'visualLevel' | 'reasonKey' | 'metadata'
> & {
  visible: boolean
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

const HANDLE_SELECTOR = '[data-node-id][data-port-id][data-port-direction]'
const SOURCE_CLASS = 'typed-port--connect-source'
const COMPATIBLE_CLASS = 'typed-port--connect-compatible'
const INCOMPATIBLE_CLASS = 'connection-overlay-port-dimmed'
const HOVER_COMPATIBLE_CLASS = 'typed-port--connect-hover-compatible'
const HOVER_INCOMPATIBLE_CLASS = 'typed-port--connect-hover-incompatible'

const hiddenPreviewState: PreviewState = {
  visible: false,
  visualLevel: 'checking',
  reasonKey: null,
  metadata: {},
}

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select, [contenteditable="true"]') !== null)
  )
}

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function readClientPoint(
  event: MouseEvent | PointerEvent | TouchEvent,
): { x: number; y: number } | null {
  if ('touches' in event) {
    const touch = event.touches[0] ?? event.changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  return { x: event.clientX, y: event.clientY }
}

function getHandleElement(
  root: HTMLElement,
  nodeId: string,
  portId: string,
  direction: 'input' | 'output',
): HTMLElement | null {
  return root.querySelector<HTMLElement>(
    `${HANDLE_SELECTOR}[data-node-id="${escapeSelectorValue(nodeId)}"][data-port-id="${escapeSelectorValue(portId)}"][data-port-direction="${direction}"]`,
  )
}

function clearConnectionClasses(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(
      `.${SOURCE_CLASS}, .${COMPATIBLE_CLASS}, .${INCOMPATIBLE_CLASS}, .${HOVER_COMPATIBLE_CLASS}, .${HOVER_INCOMPATIBLE_CLASS}`,
    )
    .forEach((element) => {
      element.classList.remove(
        SOURCE_CLASS,
        COMPATIBLE_CLASS,
        INCOMPATIBLE_CLASS,
        HOVER_COMPATIBLE_CLASS,
        HOVER_INCOMPATIBLE_CLASS,
      )
    })
}

function readHandleSnapshot(
  element: HTMLElement,
  containerRect: DOMRect,
): OverlayHandleSnapshot | null {
  const nodeId = element.dataset.nodeId
  const portId = element.dataset.portId
  if (!nodeId || !portId) {
    return null
  }

  const rect = element.getBoundingClientRect()
  return {
    nodeId,
    portId,
    x: rect.left - containerRect.left + rect.width / 2,
    y: rect.top - containerRect.top + rect.height / 2,
  }
}

function applyConnectionClasses(root: HTMLElement, state: ActiveConnectionState) {
  clearConnectionClasses(root)

  const sourceElement = getHandleElement(
    root,
    state.sourceHandle.nodeId,
    state.sourceHandle.portId,
    'output',
  )
  sourceElement?.classList.add(SOURCE_CLASS)

  state.compatibleTargets.forEach((target) => {
    getHandleElement(root, target.nodeId, target.portId, 'input')?.classList.add(
      COMPATIBLE_CLASS,
    )
  })

  state.incompatibleTargets.forEach((target) => {
    getHandleElement(root, target.nodeId, target.portId, 'input')?.classList.add(
      INCOMPATIBLE_CLASS,
    )
  })
}

export const WorkflowCanvas = memo(function WorkflowCanvas({
  className,
}: WorkflowCanvasProps) {
  const nodes = useCanvasNodes()
  const edges = useCanvasEdges()
  const viewport = useCanvasStore((state) => state.viewport)
  const {
    commitViewport,
    createConnection,
    deleteSelectedNode,
    onEdgesChange,
    onNodesChange,
    openFieldMapping,
    selectEdge,
    selectNode,
    setViewport,
    toggleSearch,
  } = useCanvasActions()
  const { notify } = useToast()
  const reactFlowInstance = useReactFlow<CanvasNode, CanvasEdge>()
  const { onDragOver, onDrop } = useCanvasDrop(reactFlowInstance)

  const [activeConnection, setActiveConnection] = useState<ActiveConnectionState | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>(hiddenPreviewState)

  const containerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<CompatibilityPreviewHandle>(null)
  const pointerRef = useRef({ x: -9999, y: -9999 })
  const frameRef = useRef<number | null>(null)
  const activeConnectionRef = useRef<ActiveConnectionState | null>(null)
  const hoveredTargetKeyRef = useRef<string | null>(null)

  useEffect(() => {
    activeConnectionRef.current = activeConnection
  }, [activeConnection])

  const resetConnectionPreview = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    hoveredTargetKeyRef.current = null

    if (containerRef.current) {
      clearConnectionClasses(containerRef.current)
    }

    previewRef.current?.setPosition(-9999, -9999)
    setActiveConnection(null)
    setPreviewState(hiddenPreviewState)
  }, [])

  useEffect(() => resetConnectionPreview, [resetConnectionPreview])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault()
        toggleSearch()
        return
      }

      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
      deleteSelectedNode()
    },
    [deleteSelectedNode, toggleSearch],
  )

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault()
        toggleSearch()
        return
      }

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
  }, [deleteSelectedNode, toggleSearch])

  useEffect(() => {
    if (!activeConnection) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const point = readClientPoint(event)
      if (!point) {
        return
      }

      pointerRef.current = point

      if (frameRef.current !== null) {
        return
      }

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        previewRef.current?.setPosition(pointerRef.current.x, pointerRef.current.y)

        const root = containerRef.current
        const currentConnection = activeConnectionRef.current
        if (!root || !currentConnection) {
          return
        }

        const hoveredTarget = document
          .elementFromPoint(pointerRef.current.x, pointerRef.current.y)
          ?.closest<HTMLElement>(`${HANDLE_SELECTOR}[data-port-direction="input"]`)
        if (!hoveredTarget) {
          hoveredTargetKeyRef.current = null
          root
            .querySelectorAll<HTMLElement>(
              `.${HOVER_COMPATIBLE_CLASS}, .${HOVER_INCOMPATIBLE_CLASS}`,
            )
            .forEach((element) => {
              element.classList.remove(HOVER_COMPATIBLE_CLASS, HOVER_INCOMPATIBLE_CLASS)
            })
          setPreviewState({
            visible: true,
            visualLevel: 'checking',
            reasonKey: null,
            metadata: {},
          })
          return
        }

        const nodeId = hoveredTarget.dataset.nodeId ?? null
        const portId = hoveredTarget.dataset.portId ?? null
        const nextKey = nodeId && portId ? `${nodeId}:${portId}` : null
        if (nextKey === hoveredTargetKeyRef.current) {
          return
        }

        hoveredTargetKeyRef.current = nextKey
        root
          .querySelectorAll<HTMLElement>(
            `.${HOVER_COMPATIBLE_CLASS}, .${HOVER_INCOMPATIBLE_CLASS}`,
          )
          .forEach((element) => {
            element.classList.remove(HOVER_COMPATIBLE_CLASS, HOVER_INCOMPATIBLE_CLASS)
          })

        if (!nodeId || !portId) {
          setPreviewState({
            visible: true,
            visualLevel: 'checking',
            reasonKey: null,
            metadata: {},
          })
          return
        }

        const evaluated = evaluateConnection(nodes, {
          source: currentConnection.sourceHandle.nodeId,
          sourceHandle: currentConnection.sourceHandle.portId,
          target: nodeId,
          targetHandle: portId,
        })

        hoveredTarget.classList.add(
          evaluated.compatible ? HOVER_COMPATIBLE_CLASS : HOVER_INCOMPATIBLE_CLASS,
        )

        setPreviewState({
          visible: true,
          visualLevel: evaluated.edgeData.visualLevel,
          reasonKey: evaluated.edgeData.reasonKey,
          metadata: evaluated.edgeData.metadata,
        })
      })
    }

    window.addEventListener('pointermove', handlePointerMove)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [activeConnection, nodes])

  const onConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      if (params.handleType !== 'source' || !params.nodeId || !params.handleId) {
        return
      }

      const sourceNodeId = params.nodeId
      const sourceHandleId = params.handleId

      const root = containerRef.current
      if (!root) {
        return
      }

      const sourceElement = getHandleElement(
        root,
        sourceNodeId,
        sourceHandleId,
        'output',
      )
      if (!sourceElement) {
        return
      }

      const containerRect = root.getBoundingClientRect()
      const sourceHandle = readHandleSnapshot(sourceElement, containerRect)
      if (!sourceHandle) {
        return
      }

      const compatibleTargets: OverlayHandleSnapshot[] = []
      const incompatibleTargets: OverlayHandleSnapshot[] = []

      root
        .querySelectorAll<HTMLElement>(`${HANDLE_SELECTOR}[data-port-direction="input"]`)
        .forEach((element) => {
          const targetNodeId = element.dataset.nodeId
          const targetPortId = element.dataset.portId
          if (!targetNodeId || !targetPortId || targetNodeId === sourceNodeId) {
            return
          }

          const snapshot = readHandleSnapshot(element, containerRect)
          if (!snapshot) {
            return
          }

          const evaluated = evaluateConnection(nodes, {
            source: sourceNodeId,
            sourceHandle: sourceHandleId,
            target: targetNodeId,
            targetHandle: targetPortId,
          })

          if (evaluated.compatible) {
            compatibleTargets.push(snapshot)
            return
          }

          incompatibleTargets.push(snapshot)
        })

      const point = readClientPoint(event)
      if (point) {
        previewRef.current?.setPosition(point.x, point.y)
      }

      const nextState: ActiveConnectionState = {
        sourceHandle,
        compatibleTargets,
        incompatibleTargets,
      }

      applyConnectionClasses(root, nextState)
      setActiveConnection(nextState)
      setPreviewState({
        visible: true,
        visualLevel: 'checking',
        reasonKey: null,
        metadata: {},
      })
    },
    [nodes],
  )

  const onConnectEnd = useCallback(() => {
    resetConnectionPreview()
  }, [resetConnectionPreview])

  const onConnect = useCallback(
    (connection: Connection) => {
      const evaluated = evaluateConnection(nodes, connection)
      if (!evaluated.compatible) {
        return
      }

      createConnection(connection, evaluated.edgeData)

      const updatedEdges = useCanvasStore.getState().edges
      const result = validateDag(nodes, updatedEdges)
      if (!result.isValid) {
        for (const err of result.errors) {
          notify({ description: err.message, variant: 'error' })
        }
      }
      for (const warn of result.warnings) {
        notify({ description: warn.message, variant: 'info' })
      }
    },
    [createConnection, nodes, notify],
  )

  const isValidConnection = useCallback(
    (connectionOrEdge: Connection | CanvasEdge) =>
      evaluateConnection(nodes, connectionOrEdge).compatible,
    [nodes],
  )

  const onViewportChange = useCallback(
    (nextViewport: Viewport) => {
      setViewport(nextViewport)
    },
    [setViewport],
  )

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: CanvasNode) => {
      selectNode(node.id)
    },
    [selectNode],
  )

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: CanvasEdge) => {
      selectEdge(edge.id)
      openFieldMapping(edge.id)
    },
    [selectEdge, openFieldMapping],
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
    selectEdge(null)
  }, [selectNode, selectEdge])

  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      commitViewport(nextViewport)
    },
    [commitViewport],
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
        onConnect={onConnect}
        isValidConnection={isValidConnection}
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
        <CanvasMiniMap />
      </ReactFlow>
      <CompatibilityPreview
        ref={previewRef}
        visible={previewState.visible}
        visualLevel={previewState.visualLevel}
        x={-9999}
        y={-9999}
        reasonKey={previewState.reasonKey}
        metadata={previewState.metadata}
      />
      <ConnectionStateOverlay
        active={!!activeConnection}
        cursor={null}
        sourceHandle={activeConnection?.sourceHandle ?? null}
        compatibleTargets={activeConnection?.compatibleTargets ?? []}
        incompatibleTargets={activeConnection?.incompatibleTargets ?? []}
        label={null}
      />
      <CanvasSearch />
      <NodeInfoCard />
    </div>
  )
})
