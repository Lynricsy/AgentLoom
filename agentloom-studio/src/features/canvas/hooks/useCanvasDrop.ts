import { useCallback, type DragEvent } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
import { DRAG_TRANSFER_TYPE } from '../components/NodePalette'
import { useCanvasActions } from '../stores/canvasStore'
import type {
  AddNodeInput,
  CanvasEdge,
  CanvasNode,
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

      const input: AddNodeInput = {
        id: generateNodeId(),
        nodeType: item.type,
        category: item.category,
        position,
        label: item.label,
        description: item.description,
      }

      addNode(input)
    },
    [addNode, reactFlowInstance]
  )

  return { onDragOver, onDrop }
}
