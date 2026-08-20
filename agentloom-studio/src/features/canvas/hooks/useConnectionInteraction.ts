import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { OnConnectStartParams } from '@xyflow/react'
import type { CompatibilityPreviewHandle } from '../components/overlays/CompatibilityPreview'
import type { OverlayHandleSnapshot } from '../components/overlays/ConnectionStateOverlay'
import {
  applyConnectionClasses,
  clearConnectionClasses,
  clearHoverClasses,
  getHandleElement,
  readClientPoint,
  readHandleSnapshot,
  HANDLE_SELECTOR,
  HOVER_COMPATIBLE_CLASS,
  HOVER_INCOMPATIBLE_CLASS,
  type ActiveConnectionState,
} from '../lib/connectionHandleDom'
import {
  arePortDataTypesCompatible,
  evaluateConnection,
  getCachedConnectionEvaluation,
} from '../lib/connectionCompatibility'
import type { CanvasEdge, CanvasEdgeData, CanvasNode } from '../types'
import type { PortDataType } from '../types/typeSchema'

export type PreviewState = Pick<
  CanvasEdgeData,
  'visualLevel' | 'reasonKey' | 'metadata'
> & {
  visible: boolean
}

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

export interface UseConnectionInteractionOptions {
  containerRef: RefObject<HTMLDivElement | null>
  previewRef: RefObject<CompatibilityPreviewHandle | null>
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  isEditingDisabled: boolean
}

export interface UseConnectionInteractionResult {
  activeConnection: ActiveConnectionState | null
  previewState: PreviewState
  onConnectStart: (
    event: MouseEvent | TouchEvent,
    params: OnConnectStartParams,
  ) => void
  onConnectEnd: () => void
}

/**
 * 连线拖拽期间的指针跟随、端口高亮与兼容性预览。
 * 兼容性检查是 cache-first + async evaluate，因此用 session / request 序号丢弃过期结果。
 */
export function useConnectionInteraction({
  containerRef,
  previewRef,
  nodes,
  edges,
  isEditingDisabled,
}: UseConnectionInteractionOptions): UseConnectionInteractionResult {
  const [activeConnection, setActiveConnection] =
    useState<ActiveConnectionState | null>(null)
  const [previewState, setPreviewState] =
    useState<PreviewState>(hiddenPreviewState)

  const pointerRef = useRef({ x: -9999, y: -9999 })
  const frameRef = useRef<number | null>(null)
  const activeConnectionRef = useRef<ActiveConnectionState | null>(null)
  const hoveredTargetKeyRef = useRef<string | null>(null)
  const dragSessionIdRef = useRef(0)
  const hoverRequestIdRef = useRef(0)

  useEffect(() => {
    activeConnectionRef.current = activeConnection
  }, [activeConnection])

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
  }, [containerRef, previewRef])

  useEffect(() => resetConnectionPreview, [resetConnectionPreview])

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
          clearHoverClasses(root)
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
        clearHoverClasses(root)

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

          clearHoverClasses(latestRoot)

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
  }, [activeConnection, containerRef, edges, nodes, previewRef])

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
    [containerRef, edges, isEditingDisabled, nodes, previewRef],
  )

  return {
    activeConnection,
    previewState,
    onConnectStart,
    onConnectEnd: resetConnectionPreview,
  }
}
