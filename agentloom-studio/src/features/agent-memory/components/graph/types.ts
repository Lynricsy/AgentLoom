import type { Node, Edge } from '@xyflow/react'

// --- API response types ---

/** 记忆节点类型 */
export type MemoryNodeType = 'root' | 'document' | 'section' | 'concept' | 'index'

/** 记忆节点 */
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

/** 记忆边 */
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

/** 记忆节点版本 */
export interface MemoryNodeVersion {
  id: string
  nodeId: string
  version: number
  content: string | null
  createdAt: string
}

// --- ReactFlow node/edge data types ---

/** ReactFlow 自定义节点数据 */
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

/** ReactFlow 自定义边数据 */
export interface MemoryGraphEdgeData extends Record<string, unknown> {
  edgeName: string | null
  priority: number | null
}

/** ReactFlow 记忆图节点类型 */
export type MemoryGraphFlowNode = Node<MemoryGraphNodeData>

/** ReactFlow 记忆图边类型 */
export type MemoryGraphFlowEdge = Edge<MemoryGraphEdgeData>
