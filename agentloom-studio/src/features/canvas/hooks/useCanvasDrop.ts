import { useCallback, type DragEvent } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
import { DRAG_TRANSFER_TYPE } from '../components/NodePalette'
import { useCanvasActions, useCanvasNodes } from '../stores/canvasStore'
import { useToast } from '@/shared/ui/toast'
import type {
  AddNodeInput,
  CanvasEdge,
  CanvasNode,
  PaletteNodeItem,
} from '../types'
import { isCompoundContainerNodeType } from '../types/controlFlow.types'
import {
  buildCompoundChildExtent,
  clampPositionToExtent,
  resolveCompoundContainerSize,
} from '../lib/compoundLayout'

function generateNodeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function useCanvasDrop(
  reactFlowInstance: ReactFlowInstance<CanvasNode, CanvasEdge>
) {
  const { addNode } = useCanvasActions()
  const nodes = useCanvasNodes()
  const { notify } = useToast()

  const resolveCompoundParent = useCallback(
    (position: { x: number; y: number }, item: PaletteNodeItem): CanvasNode | null => {
      if (item.compoundParentId) {
        return nodes.find((node) => node.id === item.compoundParentId) ?? null
      }

      const candidate = [...nodes]
        .reverse()
        .find((node) => {
          if (!isCompoundContainerNodeType(node.data.nodeType)) {
            return false
          }

          const width =
            typeof node.style?.width === 'number'
              ? node.style.width
              : typeof node.width === 'number'
                ? node.width
                : 0
          const height =
            typeof node.style?.height === 'number'
              ? node.style.height
              : typeof node.height === 'number'
                ? node.height
                : 0

          return (
            width > 0
            && height > 0
            && position.x >= node.position.x
            && position.x <= node.position.x + width
            && position.y >= node.position.y
            && position.y <= node.position.y + height
          )
        })

      return candidate ?? null
    },
    [nodes],
  )

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()

      const raw = event.dataTransfer.getData(DRAG_TRANSFER_TYPE)
      if (!raw) return

      let item: PaletteNodeItem
      try {
        item = JSON.parse(raw) as PaletteNodeItem
      } catch {
        return
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const compoundParent = resolveCompoundParent(position, item)

      if (item.compoundOnly && !compoundParent) {
        notify({
          variant: 'error',
          description: '该节点只能放在已选中的 loop / iteration 容器内部。',
        })
        return
      }

      if (compoundParent && (item.type === 'loop' || item.type === 'iteration')) {
        notify({
          variant: 'error',
          description: '当前版本暂不支持在 compound 内部继续嵌套 loop / iteration。',
        })
        return
      }

      const input: AddNodeInput = {
        id: generateNodeId(),
        nodeType: item.type,
        category: item.category,
        position: compoundParent
          ? (() => {
              const parentSize = resolveCompoundContainerSize({
                inputPortCount: compoundParent.data.inputPorts.length,
                outputPortCount: compoundParent.data.outputPorts.length,
                width:
                  typeof compoundParent.style?.width === 'number'
                    ? compoundParent.style.width
                    : typeof compoundParent.width === 'number'
                      ? compoundParent.width
                      : null,
                height:
                  typeof compoundParent.style?.height === 'number'
                    ? compoundParent.style.height
                    : typeof compoundParent.height === 'number'
                      ? compoundParent.height
                      : null,
                isCollapsed: compoundParent.data.config?.isCollapsed === true,
              })
              const extent = buildCompoundChildExtent({
                inputPortCount: compoundParent.data.inputPorts.length,
                outputPortCount: compoundParent.data.outputPorts.length,
                width: parentSize.width,
                height: parentSize.height,
              })

              return clampPositionToExtent(
                {
                  x: position.x - compoundParent.position.x,
                  y: position.y - compoundParent.position.y,
                },
                extent,
              )
            })()
          : position,
        ...(compoundParent
          ? (() => {
              const parentSize = resolveCompoundContainerSize({
                inputPortCount: compoundParent.data.inputPorts.length,
                outputPortCount: compoundParent.data.outputPorts.length,
                width:
                  typeof compoundParent.style?.width === 'number'
                    ? compoundParent.style.width
                    : typeof compoundParent.width === 'number'
                      ? compoundParent.width
                      : null,
                height:
                  typeof compoundParent.style?.height === 'number'
                    ? compoundParent.style.height
                    : typeof compoundParent.height === 'number'
                      ? compoundParent.height
                      : null,
                isCollapsed: compoundParent.data.config?.isCollapsed === true,
              })

              return {
                parentId: compoundParent.id,
                extent: buildCompoundChildExtent({
                  inputPortCount: compoundParent.data.inputPorts.length,
                  outputPortCount: compoundParent.data.outputPorts.length,
                  width: parentSize.width,
                  height: parentSize.height,
                }),
                expandParent: true,
              }
            })()
          : {}),
        label: item.label,
        description: item.description,
      }

      addNode(input)
    },
    [addNode, notify, reactFlowInstance, resolveCompoundParent]
  )

  return { onDragOver, onDrop }
}
