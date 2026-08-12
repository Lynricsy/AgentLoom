import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
  type Connection,
  type OnConnectStartParams,
  type Viewport,
} from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import { useTheme } from '@/shared/hooks/use-theme'
import { LG_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query'
import { useToast } from '@/shared/ui/toast'
import type { WorkflowStatus } from '@/features/workflow/types'
import { CanvasContextMenu } from './CanvasContextMenu'
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
import {
  WORKFLOW_EDGE_TYPES,
  WORKFLOW_NODE_TYPES,
} from './workflowFlowRegistry'
import { useCanvasDrop } from '../hooks/useCanvasDrop'
import { useExecutionHighlight } from '../hooks/useExecutionHighlight'
import {
  arePortDataTypesCompatible,
  evaluateConnection,
  getCachedConnectionEvaluation,
  resolveConnectionPorts,
} from '../lib/connectionCompatibility'
import { validateDag } from '../lib/dagValidator'
import {
  useSelectedNodeIds,
  useCanvasActions,
  useCanvasEdges,
  useCanvasNodes,
  useCanvasStore,
} from '../stores/canvasStore'
import {
  createDefaultEdgeData,
  type CanvasContextMenuState,
  type CanvasEdge,
  type CanvasEdgeData,
  type CanvasNode,
} from '../types'
import type { PortDataType } from '../types/typeSchema'
import { isCompoundContainerNodeType } from '../types/controlFlow.types'

interface WorkflowCanvasProps {
  className?: string
  workflowStatus?: WorkflowStatus
}

interface ActiveConnectionState {
  sourceHandle: OverlayHandleSnapshot
  compatibleTargets: OverlayHandleSnapshot[]
  incompatibleTargets: OverlayHandleSnapshot[]
}

interface DagValidationPreview {
  blockingError: ReturnType<typeof validateDag>['errors'][number] | null
  warnings: ReturnType<typeof validateDag>['warnings']
  tentativeEdge: CanvasEdge | null
}

type PreviewState = Pick<
  CanvasEdgeData,
  'visualLevel' | 'reasonKey' | 'metadata'
> & {
  visible: boolean
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

const checkingPreviewState: PreviewState = {
  visible: true,
  visualLevel: 'checking',
  reasonKey: null,
  metadata: {},
}

const COMPATIBILITY_REASON_LABELS: Record<string, string> = {
  type_mismatch_no_transform: '当前端口类型不兼容，且没有可用转换',
  shape_mismatch: '数据结构不兼容',
  array_cardinality_mismatch: '数组长度约束不兼容',
  scalar_schema_mismatch: '字段类型不兼容',
}

function toVisiblePreviewState(
  edgeData: Pick<CanvasEdgeData, 'visualLevel' | 'reasonKey' | 'metadata'>,
): PreviewState {
  return {
    visible: true,
    visualLevel: edgeData.visualLevel,
    reasonKey: edgeData.reasonKey,
    metadata: edgeData.metadata,
  }
}

function formatCompatibilityReason(reasonKey: string | null): string {
  if (!reasonKey) {
    return '未知原因'
  }

  return COMPATIBILITY_REASON_LABELS[reasonKey] ?? reasonKey
}

function buildTentativeEdge(
  connection: Connection | CanvasEdge,
  edgeData: CanvasEdgeData,
): CanvasEdge | null {
  if (!connection.source || !connection.target) {
    return null
  }

  return {
    id: '__tentative__',
    type: 'smart',
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? undefined,
    targetHandle: connection.targetHandle ?? undefined,
    data: edgeData,
  }
}

function normalizeHandle(handle: string | null | undefined): string | null {
  return handle ?? null
}

function isDuplicateConnection(
  connection: Connection | CanvasEdge,
  edges: CanvasEdge[],
): boolean {
  return edges.some(
    (edge) =>
      edge.source === connection.source &&
      edge.target === connection.target &&
      normalizeHandle(edge.sourceHandle) ===
        normalizeHandle(connection.sourceHandle) &&
      normalizeHandle(edge.targetHandle) ===
        normalizeHandle(connection.targetHandle),
  )
}

function previewDagValidation(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  connection: Connection | CanvasEdge,
  edgeData: CanvasEdgeData,
): DagValidationPreview {
  const tentativeEdge = buildTentativeEdge(connection, edgeData)
  if (!tentativeEdge || isDuplicateConnection(connection, edges)) {
    return {
      blockingError: null,
      warnings: [],
      tentativeEdge: null,
    }
  }

  const validation = validateDag(nodes, [...edges, tentativeEdge])
  const blockingError =
    validation.errors.find((error) => error.type === 'cycle') ??
    validation.errors[0] ??
    null

  return {
    blockingError,
    warnings: validation.warnings,
    tentativeEdge,
  }
}

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select, [contenteditable="true"]') !==
        null)
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

function applyConnectionClasses(
  root: HTMLElement,
  state: ActiveConnectionState,
) {
  clearConnectionClasses(root)

  const sourceElement = getHandleElement(
    root,
    state.sourceHandle.nodeId,
    state.sourceHandle.portId,
    'output',
  )
  sourceElement?.classList.add(SOURCE_CLASS)

  state.compatibleTargets.forEach((target) => {
    getHandleElement(
      root,
      target.nodeId,
      target.portId,
      'input',
    )?.classList.add(COMPATIBLE_CLASS)
  })

  state.incompatibleTargets.forEach((target) => {
    getHandleElement(
      root,
      target.nodeId,
      target.portId,
      'input',
    )?.classList.add(INCOMPATIBLE_CLASS)
  })
}

function isCollapsedCompoundNode(node: CanvasNode): boolean {
  return (
    isCompoundContainerNodeType(node.data.nodeType) &&
    node.data.config?.isCollapsed === true
  )
}

function collectCollapsedCompoundDescendantIds(
  nodes: readonly CanvasNode[],
): Set<string> {
  const collapsedContainerIds = new Set(
    nodes.filter(isCollapsedCompoundNode).map((node) => node.id),
  )

  if (collapsedContainerIds.size === 0) {
    return new Set()
  }

  const hiddenIds = new Set<string>()
  let changed = true

  while (changed) {
    changed = false
    for (const node of nodes) {
      const parentId = node.parentId
      if (!parentId) {
        continue
      }

      if (
        (collapsedContainerIds.has(parentId) || hiddenIds.has(parentId)) &&
        !hiddenIds.has(node.id)
      ) {
        hiddenIds.add(node.id)
        changed = true
      }
    }
  }

  return hiddenIds
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

  const [activeConnection, setActiveConnection] =
    useState<ActiveConnectionState | null>(null)
  const [contextMenuState, setContextMenuState] =
    useState<CanvasContextMenuState | null>(null)
  const [previewState, setPreviewState] =
    useState<PreviewState>(hiddenPreviewState)

  const containerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<CompatibilityPreviewHandle>(null)

  useExecutionHighlight({ containerRef, edges: renderedEdges })
  const pointerRef = useRef({ x: -9999, y: -9999 })
  const frameRef = useRef<number | null>(null)
  const activeConnectionRef = useRef<ActiveConnectionState | null>(null)
  const hoveredTargetKeyRef = useRef<string | null>(null)
  const dragSessionIdRef = useRef(0)
  const hoverRequestIdRef = useRef(0)

  useEffect(() => {
    activeConnectionRef.current = activeConnection
  }, [activeConnection])

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null)
  }, [])

  const handleDeleteSelection = useCallback(() => {
    const { selectedNodeIds: currentSelectedNodeIds } =
      useCanvasStore.getState()
    if (currentSelectedNodeIds.size > 1) {
      deleteSelectedNodes()
      return
    }

    deleteSelectedNode()
  }, [deleteSelectedNode, deleteSelectedNodes])

  const resetConnectionPreview = useCallback(() => {
    dragSessionIdRef.current += 1
    hoverRequestIdRef.current += 1

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

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        toggleSearch()
        return
      }

      if (isEditingDisabled) {
        return
      }

      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
      handleDeleteSelection()
    }

    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [handleDeleteSelection, isEditingDisabled, toggleSearch])

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
        previewRef.current?.setPosition(
          pointerRef.current.x,
          pointerRef.current.y,
        )

        const root = containerRef.current
        const currentConnection = activeConnectionRef.current
        if (!root || !currentConnection) {
          return
        }

        const hoveredTarget = document
          .elementFromPoint(pointerRef.current.x, pointerRef.current.y)
          ?.closest<HTMLElement>(
            `${HANDLE_SELECTOR}[data-port-direction="input"]`,
          )
        if (!hoveredTarget) {
          hoveredTargetKeyRef.current = null
          root
            .querySelectorAll<HTMLElement>(
              `.${HOVER_COMPATIBLE_CLASS}, .${HOVER_INCOMPATIBLE_CLASS}`,
            )
            .forEach((element) => {
              element.classList.remove(
                HOVER_COMPATIBLE_CLASS,
                HOVER_INCOMPATIBLE_CLASS,
              )
            })
          setPreviewState(checkingPreviewState)
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
            element.classList.remove(
              HOVER_COMPATIBLE_CLASS,
              HOVER_INCOMPATIBLE_CLASS,
            )
          })

        if (!nodeId || !portId) {
          setPreviewState(checkingPreviewState)
          return
        }

        const connection = {
          source: currentConnection.sourceHandle.nodeId,
          sourceHandle: currentConnection.sourceHandle.portId,
          target: nodeId,
          targetHandle: portId,
        }

        const cachedEvaluation = getCachedConnectionEvaluation(
          nodes,
          connection,
          edges,
        )
        if (cachedEvaluation) {
          hoveredTarget.classList.add(
            cachedEvaluation.compatible
              ? HOVER_COMPATIBLE_CLASS
              : HOVER_INCOMPATIBLE_CLASS,
          )
          setPreviewState(toVisiblePreviewState(cachedEvaluation.edgeData))
          return
        }

        setPreviewState(checkingPreviewState)

        const sessionId = dragSessionIdRef.current
        const requestId = ++hoverRequestIdRef.current

        void evaluateConnection(nodes, connection, edges).then((evaluated) => {
          if (
            dragSessionIdRef.current !== sessionId ||
            hoverRequestIdRef.current !== requestId ||
            hoveredTargetKeyRef.current !== nextKey
          ) {
            return
          }

          const latestRoot = containerRef.current
          if (!latestRoot) {
            return
          }

          latestRoot
            .querySelectorAll<HTMLElement>(
              `.${HOVER_COMPATIBLE_CLASS}, .${HOVER_INCOMPATIBLE_CLASS}`,
            )
            .forEach((element) => {
              element.classList.remove(
                HOVER_COMPATIBLE_CLASS,
                HOVER_INCOMPATIBLE_CLASS,
              )
            })

          const latestTarget = getHandleElement(
            latestRoot,
            nodeId,
            portId,
            'input',
          )
          latestTarget?.classList.add(
            evaluated.compatible
              ? HOVER_COMPATIBLE_CLASS
              : HOVER_INCOMPATIBLE_CLASS,
          )

          setPreviewState(toVisiblePreviewState(evaluated.edgeData))
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
  }, [activeConnection, edges, nodes])

  const onConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      if (isEditingDisabled) {
        return
      }

      if (
        params.handleType !== 'source' ||
        !params.nodeId ||
        !params.handleId
      ) {
        return
      }

      const sourceNodeId = params.nodeId
      const sourceHandleId = params.handleId
      const sessionId = dragSessionIdRef.current + 1
      dragSessionIdRef.current = sessionId
      hoverRequestIdRef.current += 1

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

      const sourcePortType = sourceElement.dataset.portType as
        | PortDataType
        | undefined

      const compatibleTargets: OverlayHandleSnapshot[] = []
      const incompatibleTargets: OverlayHandleSnapshot[] = []
      const pendingTargets: Array<{
        snapshot: OverlayHandleSnapshot
        targetNodeId: string
        targetPortId: string
      }> = []

      root
        .querySelectorAll<HTMLElement>(
          `${HANDLE_SELECTOR}[data-port-direction="input"]`,
        )
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

          const cachedEvaluation = getCachedConnectionEvaluation(
            nodes,
            {
              source: sourceNodeId,
              sourceHandle: sourceHandleId,
              target: targetNodeId,
              targetHandle: targetPortId,
            },
            edges,
          )

          if (!cachedEvaluation) {
            // 同步 dataType 预筛：不兼容的直接标记，无需等待 WASM
            const targetPortType = element.dataset.portType as
              | PortDataType
              | undefined
            if (
              sourcePortType &&
              targetPortType &&
              !arePortDataTypesCompatible(sourcePortType, targetPortType)
            ) {
              incompatibleTargets.push(snapshot)
              return
            }

            pendingTargets.push({
              snapshot,
              targetNodeId,
              targetPortId,
            })
            return
          }

          if (cachedEvaluation.compatible) {
            compatibleTargets.push(snapshot)
          } else {
            incompatibleTargets.push(snapshot)
          }
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
      setPreviewState(checkingPreviewState)

      if (pendingTargets.length === 0) {
        return
      }

      void Promise.all(
        pendingTargets.map(async (target) => ({
          snapshot: target.snapshot,
          evaluated: await evaluateConnection(
            nodes,
            {
              source: sourceNodeId,
              sourceHandle: sourceHandleId,
              target: target.targetNodeId,
              targetHandle: target.targetPortId,
            },
            edges,
          ),
        })),
      ).then((results) => {
        if (dragSessionIdRef.current !== sessionId) {
          return
        }

        const latestRoot = containerRef.current
        if (!latestRoot) {
          return
        }

        const refreshedState: ActiveConnectionState = {
          sourceHandle,
          compatibleTargets: [...compatibleTargets],
          incompatibleTargets: [...incompatibleTargets],
        }

        for (const result of results) {
          if (result.evaluated.compatible) {
            refreshedState.compatibleTargets.push(result.snapshot)
          } else {
            refreshedState.incompatibleTargets.push(result.snapshot)
          }
        }

        applyConnectionClasses(latestRoot, refreshedState)
        setActiveConnection(refreshedState)
      })
    },
    [isEditingDisabled, edges, nodes],
  )

  const onConnectEnd = useCallback(() => {
    resetConnectionPreview()
  }, [resetConnectionPreview])

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (isEditingDisabled) {
        return
      }

      const evaluated = await evaluateConnection(nodes, connection, edges)
      if (!evaluated.compatible) {
        notify({
          description: `无法创建连接：${formatCompatibilityReason(evaluated.edgeData.reasonKey)}`,
          variant: 'error',
        })
        return
      }

      const validationPreview = previewDagValidation(
        nodes,
        edges,
        connection,
        evaluated.edgeData,
      )
      if (!validationPreview.tentativeEdge) {
        return
      }

      if (validationPreview.blockingError) {
        if (validationPreview.blockingError.type === 'cycle') {
          console.warn('检测到循环依赖，已阻止创建连接', {
            connection,
            error: validationPreview.blockingError,
          })
          notify({
            description: '无法创建连接：检测到循环依赖',
            variant: 'error',
          })
          return
        }

        notify({
          description: validationPreview.blockingError.message,
          variant: 'error',
        })
        return
      }

      createConnection(connection, evaluated.edgeData)

      for (const warn of validationPreview.warnings) {
        notify({ description: warn.message, variant: 'warning' })
      }
    },
    [createConnection, edges, isEditingDisabled, nodes, notify],
  )

  const isValidConnection = useCallback(
    (connectionOrEdge: Connection | CanvasEdge) => {
      if (isEditingDisabled) {
        return false
      }

      const cachedEvaluation = getCachedConnectionEvaluation(
        nodes,
        connectionOrEdge,
        edges,
      )
      if (cachedEvaluation && !cachedEvaluation.compatible) {
        return false
      }

      // 缓存未命中时，同步检查端口 dataType 兼容性
      if (!cachedEvaluation) {
        const resolved = resolveConnectionPorts(nodes, connectionOrEdge)
        if (
          resolved &&
          !arePortDataTypesCompatible(
            resolved.source.port.dataType,
            resolved.target.port.dataType,
          )
        ) {
          return false
        }
      }

      const validationPreview = previewDagValidation(
        nodes,
        edges,
        connectionOrEdge,
        cachedEvaluation?.edgeData ?? createDefaultEdgeData(),
      )

      return validationPreview.blockingError === null
    },
    [edges, isEditingDisabled, nodes],
  )

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

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: CanvasNode) => {
      event.preventDefault()

      if (isEditingDisabled) {
        closeContextMenu()
        return
      }

      if (!selectedNodeIds.has(node.id)) {
        selectNode(node.id)
      }

      setContextMenuState({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      })
    },
    [closeContextMenu, isEditingDisabled, selectNode, selectedNodeIds],
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

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
      event.preventDefault()

      if (isEditingDisabled) {
        closeContextMenu()
        return
      }

      setContextMenuState({
        x: event.clientX,
        y: event.clientY,
      })
    },
    [closeContextMenu, isEditingDisabled],
  )

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
      <ReactFlow<CanvasNode, CanvasEdge>
        nodes={renderedNodes}
        edges={renderedEdges}
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
        onDragOver={handleDragOver}
        onDrop={handleDrop}
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
        colorMode={resolvedTheme}
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
      <CanvasContextMenu
        state={contextMenuState}
        onClose={closeContextMenu}
        onEncapsulate={handleEncapsulate}
        selectedNodeCount={selectedNodeCount}
      />
    </div>
  )
})
