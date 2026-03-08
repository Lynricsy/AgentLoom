import type { Edge, Node, Viewport, XYPosition } from '@xyflow/react'
import type { NodeType, PortDefinition } from './types/nodeTypeRegistry'
import type { TypeSchema } from './types/typeSchema'

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
  llmConfigId?: string | null
  parameters?: Record<string, unknown>
  inputPorts: PortDefinition[]
  outputPorts: PortDefinition[]
}

export type CanvasNode = Node<CanvasNodeData, NodeCategory>

// ── Agent 节点扩展数据 ──────────────────────────────────────────

export interface AgentModelConfig {
  connectedModelNodeId: string | null
}

export interface AgentNodeData extends CanvasNodeData {
  modelConfig: AgentModelConfig
  autonomyConfig: Record<string, unknown>
  outputFormatStrategy: Record<string, unknown>
  toolBindings: string[]
  knowledgeBindings: string[]
}

export function createDefaultAgentNodeData(): Pick<
  AgentNodeData,
  'modelConfig' | 'autonomyConfig' | 'outputFormatStrategy' | 'toolBindings' | 'knowledgeBindings'
> {
  return {
    modelConfig: { connectedModelNodeId: null },
    autonomyConfig: {},
    outputFormatStrategy: {},
    toolBindings: [],
    knowledgeBindings: [],
  }
}

// ── 边兼容性类型 (TypeEngine WASM 合约) ──────────────────────────

/** TypeEngine 返回的原始兼容性等级（SCREAMING_SNAKE_CASE，与 Rust serde 对齐） */
export type RawCompatibilityLevel = 'EXACT' | 'TRANSFORM' | 'PARTIAL' | 'INCOMPATIBLE'

export type VisualCompatibilityLevel = 'L0' | 'L1' | 'checking' | 'error'

export interface MissingFieldInfo {
  path: string
  expectedType: TypeSchema
  required: boolean
}

export interface CandidateFieldMapping {
  sourcePath: string
  targetPath: string
  confidence: number
  autoRecommended: boolean
}

/** 用户确认后的映射（区别于 CandidateFieldMapping 的 WASM 候选） */
export interface FieldMapping {
  sourceField: string
  targetField: string
  compatLevel: 'L0' | 'L1'
  autoRecommended: boolean
  confidence?: number
  required?: boolean
}

export interface EdgeMappingSummary {
  autoMatchedCount: number
  manualCount: number
  requiredUnmappedCount: number
}

export interface CanvasEdgeData extends Record<string, unknown> {
  rawCompatibilityLevel: RawCompatibilityLevel
  visualLevel: VisualCompatibilityLevel
  reasonKey: string | null
  transformFn: string | null
  missingFields: MissingFieldInfo[]
  candidateMappings: CandidateFieldMapping[]
  fieldMapping: FieldMapping[]
  metadata: {
    matchedRatio?: number
    matchedRequiredCount?: number
    totalRequiredCount?: number
    unmappedRequiredCount?: number
  }
  mappingSummary: EdgeMappingSummary
}

export function createDefaultEdgeData(): CanvasEdgeData {
  return {
    rawCompatibilityLevel: 'EXACT',
    visualLevel: 'L0',
    reasonKey: null,
    transformFn: null,
    missingFields: [],
    candidateMappings: [],
    fieldMapping: [],
    metadata: {},
    mappingSummary: {
      autoMatchedCount: 0,
      manualCount: 0,
      requiredUnmappedCount: 0,
    },
  }
}

export type CanvasEdge = Edge<CanvasEdgeData>

export interface AddNodeInput {
  id: string
  nodeType: NodeType
  category: NodeCategory
  position: XYPosition
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

export type { NodeType, PortDefinition, CreatePortOptions } from './types/nodeTypeRegistry'
export type { PortDataType, TypeSchema } from './types/typeSchema'
