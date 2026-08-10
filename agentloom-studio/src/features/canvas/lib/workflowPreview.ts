import type { Edge, Node, Viewport } from '@xyflow/react'
import type { AgentRuntimeMode } from '@/features/agent/types/agentRuntimeMode'
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  NodeCategory,
} from '../types'
import { createDefaultAgentNodeData, createDefaultEdgeData } from '../types'
import {
  getNodeTypeConfigOrNull,
  getWorkflowAgentInputPorts,
  type NodeType,
  type PortDefinition,
} from '../types/nodeTypeRegistry'
import {
  clonePortDefinitions,
  hydratePortDefinitions,
} from '../types/portSchema'

const NODE_CATEGORIES = new Set<NodeCategory>([
  'agent',
  'tool',
  'trigger',
  'knowledge',
  'output',
  'control',
  'plugin',
  'memory',
])

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

export interface WorkflowPreviewDefinition {
  nodes?: unknown[]
  edges?: unknown[]
  viewport?: Viewport | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isNodeCategory(value: unknown): value is NodeCategory {
  return typeof value === 'string' && NODE_CATEGORIES.has(value as NodeCategory)
}

function readRuntimeMode(
  data: Record<string, unknown>,
): AgentRuntimeMode | null {
  const rawValue =
    readString(data.agentRuntimeMode) ??
    (isRecord(data.config) ? readString(data.config.runtimeMode) : null)

  return rawValue === 'sandbox' || rawValue === 'no_sandbox' ? rawValue : null
}

function mergeHydratedPorts(
  ports: unknown,
  defaultPorts: PortDefinition[],
): PortDefinition[] {
  if (!Array.isArray(ports)) {
    return defaultPorts
  }

  const hydratedPorts = hydratePortDefinitions(
    ports as PortDefinition[],
    defaultPorts,
  )

  if (defaultPorts.length === 0) {
    return hydratedPorts
  }

  const hydratedById = new Map(hydratedPorts.map((port) => [port.id, port]))
  const defaultPortIds = new Set(defaultPorts.map((port) => port.id))

  return [
    ...defaultPorts.map((port) => hydratedById.get(port.id) ?? port),
    ...hydratedPorts.filter((port) => !defaultPortIds.has(port.id)),
  ]
}

function buildFallbackNode(
  rawNode: Record<string, unknown>,
  rawData: Record<string, unknown>,
  position: { x: number; y: number },
): Node {
  return {
    ...rawNode,
    id: rawNode.id as string,
    type: 'default',
    position,
    data: {
      label:
        readString(rawData.label) ??
        readString(rawData.nodeType) ??
        readString(rawNode.type) ??
        'Node',
    },
  }
}

function normalizePreviewNode(rawNode: unknown): Node | null {
  if (!isRecord(rawNode)) {
    return null
  }

  const id = readString(rawNode.id)
  const positionRecord = isRecord(rawNode.position) ? rawNode.position : null
  if (!id || !positionRecord) {
    return null
  }

  const position = {
    x: readNumber(positionRecord.x) ?? 0,
    y: readNumber(positionRecord.y) ?? 0,
  }
  const rawData = isRecord(rawNode.data) ? rawNode.data : {}
  const nodeTypeValue =
    readString(rawData.nodeType) ?? readString(rawData.node_type)

  if (!nodeTypeValue) {
    return buildFallbackNode(rawNode, rawData, position)
  }

  const typeConfig = getNodeTypeConfigOrNull(nodeTypeValue)
  if (!typeConfig) {
    return buildFallbackNode(rawNode, rawData, position)
  }

  const nodeType = nodeTypeValue as NodeType
  const runtimeMode = nodeType === 'agent' ? readRuntimeMode(rawData) : null
  const defaultInputPorts =
    nodeType === 'agent'
      ? getWorkflowAgentInputPorts(runtimeMode)
      : clonePortDefinitions(typeConfig.inputPorts)
  const defaultOutputPorts = clonePortDefinitions(typeConfig.outputPorts)
  const inputPorts = mergeHydratedPorts(rawData.inputPorts, defaultInputPorts)
  const outputPorts = mergeHydratedPorts(
    rawData.outputPorts,
    defaultOutputPorts,
  )
  const category = isNodeCategory(rawNode.type)
    ? rawNode.type
    : typeConfig.category
  const config = isRecord(rawData.config) ? rawData.config : {}
  const baseData: CanvasNodeData = {
    ...rawData,
    ...(nodeType === 'agent' ? createDefaultAgentNodeData() : {}),
    label:
      readString(rawData.label) ?? readString(rawData.name) ?? typeConfig.label,
    nodeType,
    category,
    description: readString(rawData.description) ?? typeConfig.description,
    config,
    inputPorts,
    outputPorts,
  }

  return {
    ...rawNode,
    id,
    type: category,
    position,
    data: baseData,
  } satisfies CanvasNode
}

function normalizePreviewEdge(rawEdge: unknown): Edge | null {
  if (!isRecord(rawEdge)) {
    return null
  }

  const id = readString(rawEdge.id)
  const source = readString(rawEdge.source)
  const target = readString(rawEdge.target)
  if (!id || !source || !target) {
    return null
  }

  const rawData = isRecord(rawEdge.data) ? rawEdge.data : {}

  return {
    ...rawEdge,
    id,
    source,
    target,
    type: 'smart',
    sourceHandle:
      readString(rawEdge.sourceHandle) ??
      readString(rawEdge.source_handle) ??
      undefined,
    targetHandle:
      readString(rawEdge.targetHandle) ??
      readString(rawEdge.target_handle) ??
      undefined,
    data: {
      ...createDefaultEdgeData(),
      ...rawData,
      readonlyPreview: true,
    },
  } satisfies CanvasEdge
}

function normalizeViewport(viewport: unknown): Viewport {
  if (!isRecord(viewport)) {
    return DEFAULT_VIEWPORT
  }

  return {
    x: readNumber(viewport.x) ?? DEFAULT_VIEWPORT.x,
    y: readNumber(viewport.y) ?? DEFAULT_VIEWPORT.y,
    zoom: readNumber(viewport.zoom) ?? DEFAULT_VIEWPORT.zoom,
  }
}

export function buildWorkflowPreviewGraph(
  definition: WorkflowPreviewDefinition | null | undefined,
): {
  nodes: Node[]
  edges: Edge[]
  viewport: Viewport
} {
  const nodes = Array.isArray(definition?.nodes)
    ? definition.nodes
        .map((node) => normalizePreviewNode(node))
        .filter((node): node is Node => node !== null)
    : []
  const edges = Array.isArray(definition?.edges)
    ? definition.edges
        .map((edge) => normalizePreviewEdge(edge))
        .filter((edge): edge is Edge => edge !== null)
    : []

  return {
    nodes,
    edges,
    viewport: normalizeViewport(definition?.viewport),
  }
}
