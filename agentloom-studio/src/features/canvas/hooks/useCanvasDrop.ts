import { useCallback, type DragEvent } from 'react'
import type { ReactFlowInstance } from '@xyflow/react'
import {
  fetchBlockById,
  type BlockDefinition as ReusableBlockDefinition,
  type BlockPort,
} from '@/features/block-library'
import {
  PORT_DATA_TYPE_META,
  type PortDefinition,
} from '../types/nodeTypeRegistry'
import { createPort } from '../types/portSchema'
import { DRAG_TRANSFER_TYPE } from '../components/NodePalette'
import { useCanvasActions, useCanvasNodes } from '../stores/canvasStore'
import { useToast } from '@/shared/ui/toast'
import type { AddNodeInput, CanvasEdge, CanvasNode, PaletteNodeItem } from '../types'
import { isCompoundContainerNodeType } from '../types/controlFlow.types'
import { buildCompoundChildExtent, clampPositionToExtent, readCompoundNodeDimension, resolveCompoundContainerSize } from '../lib/compoundLayout'
import type { PortDataType } from '../types/typeSchema'

function generateNodeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizePortDataType(dataType: string): PortDataType {
  if (dataType in PORT_DATA_TYPE_META) {
    return dataType as PortDataType
  }

  if (dataType === 'number' || dataType === 'boolean') {
    return 'json'
  }

  return 'json'
}

function buildBlockPorts(
  ports: BlockPort[],
  direction: 'input' | 'output',
): PortDefinition[] {
  return ports.map((port) =>
    createPort(
      port.id,
      port.label,
      direction,
      normalizePortDataType(port.dataType),
      {
        description: `${direction === 'input' ? '块输入' : '块输出'}端口`,
      },
    ),
  )
}

function toCanvasBlockDefinition(
  definition: ReusableBlockDefinition,
): NonNullable<AddNodeInput['blockDefinition']> {
  return {
    nodes: definition.nodes as CanvasNode[],
    edges: definition.edges as CanvasEdge[],
    inputPorts: definition.inputPorts,
    outputPorts: definition.outputPorts,
    ...(definition.viewport ? { viewport: definition.viewport } : {}),
  }
}

export function useCanvasDrop(reactFlowInstance: ReactFlowInstance<CanvasNode, CanvasEdge>) {
  const { addNode } = useCanvasActions()
  const nodes = useCanvasNodes()
  const { notify } = useToast()

  const resolveCompoundParent = useCallback(
    (position: { x: number; y: number }, item: PaletteNodeItem): CanvasNode | null => {
      if (item.compoundParentId) {
        return nodes.find((node) => node.id === item.compoundParentId) ?? null
      }

      const candidate = [...nodes].reverse().find((node) => {
        if (!isCompoundContainerNodeType(node.data.nodeType)) {
          return false
        }

        const width = readCompoundNodeDimension(node, 'width') ?? 0
        const height = readCompoundNodeDimension(node, 'height') ?? 0

        return width > 0 && height > 0 && position.x >= node.position.x && position.x <= node.position.x + width && position.y >= node.position.y && position.y <= node.position.y + height
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
                width: readCompoundNodeDimension(compoundParent, 'width'),
                height: readCompoundNodeDimension(compoundParent, 'height'),
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
                width: readCompoundNodeDimension(compoundParent, 'width'),
                height: readCompoundNodeDimension(compoundParent, 'height'),
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
              }
            })()
          : {}),
        label: item.label,
        description: item.description,
        ...(item.inputPorts ? { inputPorts: item.inputPorts } : {}),
        ...(item.outputPorts ? { outputPorts: item.outputPorts } : {}),
        ...(item.pluginId ? { pluginId: item.pluginId } : {}),
        ...(item.pluginName ? { pluginName: item.pluginName } : {}),
        ...(item.pluginVersion ? { pluginVersion: item.pluginVersion } : {}),
        ...(item.pluginNodeType ? { pluginNodeType: item.pluginNodeType } : {}),
        ...(item.pluginConfigSchema
          ? { pluginConfigSchema: item.pluginConfigSchema }
          : {}),
      }

      if (item.type === 'reusable-block') {
        if (!item.blockId) {
          notify({
            variant: 'error',
            description: '可复用块缺少 blockId，无法实例化。',
          })
          return
        }

        void fetchBlockById(item.blockId)
          .then((block) => {
            addNode({
              ...input,
              label: block.name,
              description: block.description ?? input.description,
              blockId: block.id,
              blockName: block.name,
              blockDefinition: toCanvasBlockDefinition(block.definition),
              inputPorts: buildBlockPorts(block.definition.inputPorts, 'input'),
              outputPorts: buildBlockPorts(
                block.definition.outputPorts,
                'output',
              ),
              isExpanded: false,
            })
          })
          .catch((error) => {
            notify({
              variant: 'error',
              description:
                error instanceof Error
                  ? error.message
                  : '加载可复用块详情失败。',
            })
          })

        return
      }

      addNode(input)
    },
    [addNode, notify, reactFlowInstance, resolveCompoundParent],
  )

  return { onDragOver, onDrop }
}
