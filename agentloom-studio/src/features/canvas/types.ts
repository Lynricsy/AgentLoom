import type { Edge, Node, Viewport } from '@xyflow/react'

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
  nodeType: string
  category: NodeCategory
  description?: string
  config?: Record<string, unknown>
}

export type CanvasNode = Node<CanvasNodeData>

export type CanvasEdge = Edge

export interface PaletteNodeItem {
  type: string
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
