import type { CanvasEdge, CanvasNode, PortDataType } from '../types'
import { createDefaultEdgeData } from '../types'
import { createPort, type PortDefinition } from '../types/nodeTypeRegistry'

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
        label: targetPort.label,
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
        label: sourcePort.label,
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

  return {
    selectedNodes,
    selectedEdges,
    incomingEdges,
    outgoingEdges,
    inputPorts: deriveInputPorts(incomingEdges, selectedNodeMap),
    outputPorts: deriveOutputPorts(outgoingEdges, selectedNodeMap),
    centroid: calculateCentroid(selectedNodes),
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
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
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
      blockDefinition: {
        nodes: analysis.selectedNodes,
        edges: analysis.selectedEdges,
        inputPorts: analysis.inputPorts,
        outputPorts: analysis.outputPorts,
      },
      isExpanded: false,
    },
  }

  return {
    nodes: [...remainingNodes, blockNode],
    edges: [...remainingEdges, ...incomingReconnectEdges, ...outgoingReconnectEdges],
  }
}
