import type { Node, Edge } from '@xyflow/react'

// --- API response types ---

export type MemoryNodeType = 'root' | 'document' | 'section' | 'concept' | 'index'

export interface MemoryNode {
  id: string
  instanceId: string
  name: string
  nodeType: MemoryNodeType
  domain: string | null
  content: string | null
  disclosureLevel: string | null
  tenantId: string
  createdAt: string
  updatedAt: string
}

export interface MemoryEdge {
  id: string
  instanceId: string
  parentNodeId: string
  childNodeId: string
  name: string | null
  priority: number | null
  tenantId: string
  createdAt: string
}

export interface MemoryNodeVersion {
  id: string
  nodeId: string
  version: number
  content: string | null
  createdAt: string
}

// --- ReactFlow node/edge data types ---

export interface MemoryGraphNodeData extends Record<string, unknown> {
  nodeId: string
  name: string
  nodeType: MemoryNodeType
  domain: string | null
  contentSnippet: string
  disclosureLevel: string | null
  isHighlighted: boolean
  isDimmed: boolean
}

export interface MemoryGraphEdgeData extends Record<string, unknown> {
  edgeName: string | null
  priority: number | null
}

export type MemoryGraphFlowNode = Node<MemoryGraphNodeData>

export type MemoryGraphFlowEdge = Edge<MemoryGraphEdgeData>
