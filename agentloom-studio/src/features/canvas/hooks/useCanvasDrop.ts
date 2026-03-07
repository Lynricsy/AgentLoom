import { useCallback, type DragEvent } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
import { DRAG_TRANSFER_TYPE } from '../components/NodePalette'
import { useCanvasActions } from '../stores/canvasStore'
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  PaletteNodeItem,
} from '../types'

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

      const newNode: CanvasNode = {
        id: generateNodeId(),
        type: 'default',
        position,
        data: {
          label: item.label,
          nodeType: item.type,
          category: item.category,
          description: item.description,
        } satisfies CanvasNodeData,
      }

      addNode(newNode)
    },
    [addNode, reactFlowInstance]
  )

  return { onDragOver, onDrop }
}
