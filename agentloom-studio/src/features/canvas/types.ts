import type { Edge, Node, Viewport } from '@xyflow/react'
import type { NodeType } from './nodeTypeRegistry'
import type { PortDefinition } from './typeSchema'

export type NodeCategory = 'agent' | 'tool' | 'trigger' | 'knowledge' | 'output' | 'control'

export interface NodeCategoryMeta {
  category: NodeCategory
  label: string
  icon: string
  color: string
  description: string
}

export interface CanvasNodeData extends Record<string, unknown> {
  label: string
  nodeType: NodeType
  category: NodeCategory
  description?: string
  config: Record<string, unknown>
  inputPorts: PortDefinition[]
  outputPorts: PortDefinition[]
}

export type CanvasNode = Node<CanvasNodeData>

export type CanvasEdge = Edge

export interface AddNodeInput {
  id: string
  nodeType: NodeType
  category: NodeCategory
  position: { x: number; y: number }
  label?: string
  description?: string
  config?: Record<string, unknown>
}

export interface PaletteNodeItem {
  type: NodeType
  label: string
  category: NodeCategory
  icon: string
  description: string
}

export interface PaletteGroup {
  category: NodeCategory
  label: string
  icon: string
  color: string
  items: PaletteNodeItem[]
}

export interface CanvasSnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport?: Viewport
}
