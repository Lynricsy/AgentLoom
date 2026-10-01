import type { CanvasEdge, CanvasNode, PortDataType } from '../types'
import { createDefaultEdgeData } from '../types'
import { type PortDefinition } from '../types/nodeTypeRegistry'
import { createPort } from '../types/portSchema'

export interface DerivedPort {
  id: string
  label: string
  dataType: PortDataType
  sourceNodeId: string
  sourcePortId: string
}

export interface EncapsulationAnalysis {
  selectedNodes: CanvasNode[]
  selectedEdges: CanvasEdge[]
  incomingEdges: CanvasEdge[]
  outgoingEdges: CanvasEdge[]
  inputPorts: DerivedPort[]
  outputPorts: DerivedPort[]
  centroid: { x: number; y: number }
  /** 被封装节点所在的容器（Loop / Iteration）；顶层为 undefined，块节点放回同一容器 */
  parentId?: string
}

/** 块的内嵌定义：与 POST /reusable-blocks 的 `definition` 以及块节点的 `data.blockDefinition` 同构 */
export interface EncapsulatedBlockDefinition {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  inputPorts: DerivedPort[]
  outputPorts: DerivedPort[]
}

/** 容器的入口节点随容器存在，不能单独移进块里 */
const CONTAINER_ENTRY_NODE_TYPES = new Set(['loop-start', 'iteration-start'])

function collectWithDescendants(rootIds: Iterable<string>, nodes: CanvasNode[]): Set<string> {
  const result = new Set(rootIds)
  let grew = true
  while (grew) {
    grew = false
    for (const node of nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id)
        grew = true
      }
    }
  }
  return result
}

/**
 * 解析「封装为可复用块」的节点集合：选中的容器连同其子节点一起封装；
 * 所有被选的最外层节点必须位于同一层级（同为顶层或同一容器内）。
 */
export function resolveEncapsulationSelection(
  selectedNodeIds: Set<string>,
  nodes: CanvasNode[],
): { nodeIds: Set<string> } | { error: string } {
  const nodeIds = collectWithDescendants(
    nodes.filter((node) => selectedNodeIds.has(node.id)).map((node) => node.id),
    nodes,
  )
  const roots = nodes.filter(
    (node) => nodeIds.has(node.id) && !(node.parentId && nodeIds.has(node.parentId)),
  )

  if (roots.length < 2) {
    return { error: '至少选择两个节点才能封装为可复用块' }
  }
  if (roots.some((node) => CONTAINER_ENTRY_NODE_TYPES.has(node.data.nodeType))) {
    return { error: '循环 / 迭代的入口节点不能单独封装，请连同所在容器一起选择' }
  }
  if (roots.some((node) => node.data.nodeType === 'reusable-block' && node.data.isExpanded)) {
    return { error: '请先收起已展开的可复用块再封装' }
  }
  if (new Set(roots.map((node) => node.parentId ?? '')).size > 1) {
    return { error: '只能封装同一层级的节点（同为顶层或同一个容器内）' }
  }

  return { nodeIds }
}

function findPort(
  node: CanvasNode | undefined,
  portId: string | null | undefined,
  direction: 'input' | 'output',
): PortDefinition | null {
  if (!node) {
    return null
  }

  const ports = direction === 'input' ? node.data.inputPorts : node.data.outputPorts

  if (portId) {
    return ports.find((port) => port.id === portId) ?? null
  }

  return ports.length === 1 ? ports[0] ?? null : null
}

function dedupeDerivedPorts(ports: DerivedPort[]): DerivedPort[] {
  const deduped = new Map<string, DerivedPort>()

  ports.forEach((port) => {
    const key = `${port.sourceNodeId}:${port.sourcePortId}`
    if (!deduped.has(key)) {
      deduped.set(key, port)
    }
  })

  return [...deduped.values()]
}

function deriveInputPorts(incomingEdges: CanvasEdge[], selectedNodeMap: Map<string, CanvasNode>): DerivedPort[] {
  const ports = incomingEdges.flatMap((edge) => {
    const targetNode = selectedNodeMap.get(edge.target)
    const targetPort = findPort(targetNode, edge.targetHandle, 'input')

    if (!targetNode || !targetPort) {
      return []
    }

    return [
      {
        id: crypto.randomUUID(),
        label: targetPort.label || targetPort.id,
        dataType: targetPort.dataType,
        sourceNodeId: targetNode.id,
        sourcePortId: targetPort.id,
      },
    ]
  })

  return dedupeDerivedPorts(ports)
}

function deriveOutputPorts(
  outgoingEdges: CanvasEdge[],
  selectedNodeMap: Map<string, CanvasNode>,
): DerivedPort[] {
  const ports = outgoingEdges.flatMap((edge) => {
    const sourceNode = selectedNodeMap.get(edge.source)
    const sourcePort = findPort(sourceNode, edge.sourceHandle, 'output')

    if (!sourceNode || !sourcePort) {
      return []
    }

    return [
      {
        id: crypto.randomUUID(),
        label: sourcePort.label || sourcePort.id,
        dataType: sourcePort.dataType,
        sourceNodeId: sourceNode.id,
        sourcePortId: sourcePort.id,
      },
    ]
  })

  return dedupeDerivedPorts(ports)
}

function calculateCentroid(selectedNodes: CanvasNode[]): { x: number; y: number } {
  if (selectedNodes.length === 0) {
    return { x: 0, y: 0 }
  }

  const totals = selectedNodes.reduce(
    (acc, node) => ({
      x: acc.x + node.position.x,
      y: acc.y + node.position.y,
    }),
    { x: 0, y: 0 },
  )

  return {
    x: totals.x / selectedNodes.length,
    y: totals.y / selectedNodes.length,
  }
}

export function analyzeEncapsulation(
  selectedNodeIds: Set<string>,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): EncapsulationAnalysis {
  const selectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id))
  const selectedNodeMap = new Map(selectedNodes.map((node) => [node.id, node]))

  const selectedEdges = edges.filter(
    (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target),
  )
  const incomingEdges = edges.filter(
    (edge) => selectedNodeIds.has(edge.target) && !selectedNodeIds.has(edge.source),
  )
  const outgoingEdges = edges.filter(
    (edge) => selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target),
  )
  const roots = selectedNodes.filter(
    (node) => !(node.parentId && selectedNodeIds.has(node.parentId)),
  )
  const parentIds = new Set(roots.map((node) => node.parentId))
  const [commonParentId] = parentIds

  return {
    selectedNodes,
    selectedEdges,
    incomingEdges,
    outgoingEdges,
    inputPorts: deriveInputPorts(incomingEdges, selectedNodeMap),
    outputPorts: deriveOutputPorts(outgoingEdges, selectedNodeMap),
    centroid: calculateCentroid(roots),
    ...(parentIds.size === 1 && commonParentId ? { parentId: commonParentId } : {}),
  }
}

/**
 * 块的内嵌定义。块内最外层节点去掉指向块外容器的 parentId / extent：
 * server 展平时，块内顶层节点继承块节点自己的 parentId。
 */
export function buildBlockDefinition(analysis: EncapsulationAnalysis): EncapsulatedBlockDefinition {
  const memberIds = new Set(analysis.selectedNodes.map((node) => node.id))

  return {
    nodes: analysis.selectedNodes.map((node) => {
      const { selected: _selected, dragging: _dragging, ...rest } = node
      if (!rest.parentId || memberIds.has(rest.parentId)) {
        return rest
      }
      const { parentId: _parentId, extent: _extent, ...detached } = rest
      return detached
    }),
    edges: analysis.selectedEdges.map(({ selected: _selected, ...edge }) => edge),
    inputPorts: analysis.inputPorts,
    outputPorts: analysis.outputPorts,
  }
}

function createBlockPortDefinition(port: DerivedPort, direction: 'input' | 'output'): PortDefinition {
  return createPort(port.id, port.label, direction, port.dataType)
}

export function replaceNodesWithBlock(
  analysis: EncapsulationAnalysis,
  blockId: string,
  blockName: string,
  allNodes: CanvasNode[],
  allEdges: CanvasEdge[],
): { nodes: CanvasNode[]; edges: CanvasEdge[]; blockNodeId: string } {
  const removedNodeIds = new Set(analysis.selectedNodes.map((node) => node.id))
  const removedEdgeIds = new Set(
    [...analysis.selectedEdges, ...analysis.incomingEdges, ...analysis.outgoingEdges].map(
      (edge) => edge.id,
    ),
  )

  const blockNodeId = crypto.randomUUID()
  const inputPorts = analysis.inputPorts.map((port) => createBlockPortDefinition(port, 'input'))
  const outputPorts = analysis.outputPorts.map((port) => createBlockPortDefinition(port, 'output'))

  const remainingNodes = allNodes.filter((node) => !removedNodeIds.has(node.id))
  const remainingEdges = allEdges.filter((edge) => !removedEdgeIds.has(edge.id))

  const inputPortBySource = new Map(
    analysis.inputPorts.map((port) => [`${port.sourceNodeId}:${port.sourcePortId}`, port]),
  )
  const outputPortBySource = new Map(
    analysis.outputPorts.map((port) => [`${port.sourceNodeId}:${port.sourcePortId}`, port]),
  )

  const incomingReconnectEdges = analysis.incomingEdges.flatMap((edge) => {
    const port = inputPortBySource.get(`${edge.target}:${edge.targetHandle ?? ''}`)

    if (!port) {
      return []
    }

    return [
      {
        id: crypto.randomUUID(),
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: blockNodeId,
        targetHandle: port.id,
        data: createDefaultEdgeData(),
      } satisfies CanvasEdge,
    ]
  })

  const outgoingReconnectEdges = analysis.outgoingEdges.flatMap((edge) => {
    const port = outputPortBySource.get(`${edge.source}:${edge.sourceHandle ?? ''}`)

    if (!port) {
      return []
    }

    return [
      {
        id: crypto.randomUUID(),
        source: blockNodeId,
        sourceHandle: port.id,
        target: edge.target,
        targetHandle: edge.targetHandle,
        data: createDefaultEdgeData(),
      } satisfies CanvasEdge,
    ]
  })

  const blockNode: CanvasNode = {
    id: blockNodeId,
    type: 'control',
    position: analysis.centroid,
    ...(analysis.parentId ? { parentId: analysis.parentId } : {}),
    data: {
      label: blockName,
      nodeType: 'reusable-block' as CanvasNode['data']['nodeType'],
      category: 'control',
      description: '可复用块节点',
      config: {},
      inputPorts,
      outputPorts,
      blockId,
      blockName,
      blockDefinition: buildBlockDefinition(analysis),
      isExpanded: false,
    },
  }

  return {
    nodes: [...remainingNodes, blockNode],
    edges: [...remainingEdges, ...incomingReconnectEdges, ...outgoingReconnectEdges],
    blockNodeId,
  }
}
