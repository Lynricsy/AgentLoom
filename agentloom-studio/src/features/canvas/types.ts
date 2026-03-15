import type { Edge, Node, Viewport, XYPosition } from '@xyflow/react'
import { DEFAULT_AUTONOMY_CONFIG, DEFAULT_OUTPUT_FORMAT_STRATEGY } from './autonomy.types'
import type { AutonomyConfig, OutputFormatStrategy } from './autonomy.types'
import type { NodeType, PortDefinition } from './types/nodeTypeRegistry'
import type { PortDataType, TypeSchema } from './types/typeSchema'

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
  mcpToolDefinitionId?: string
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
  autonomyConfig: AutonomyConfig
  outputFormatStrategy: OutputFormatStrategy
  toolBindings: string[]
  knowledgeBindings: string[]
}

export function createDefaultAgentNodeData(): Pick<
  AgentNodeData,
  'modelConfig' | 'autonomyConfig' | 'outputFormatStrategy' | 'toolBindings' | 'knowledgeBindings'
> {
  return {
    modelConfig: { connectedModelNodeId: null },
    autonomyConfig: { ...DEFAULT_AUTONOMY_CONFIG },
    outputFormatStrategy: { ...DEFAULT_OUTPUT_FORMAT_STRATEGY },
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

// ── L2 字段映射增强类型 ──────────────────────────────────────────

/** 类型强制转换策略 */
export type CoercionStrategy =
  | 'parseInt'
  | 'parseFloat'
  | 'Number'
  | 'toString'
  | 'toFixed'
  | 'JSON.stringify'
  | 'JSON.parse'
  | 'first'
  | 'last'
  | 'join'

/** 类型强制转换配置 */
export interface TypeCoercionConfig {
  strategy: CoercionStrategy
  params?: Record<string, unknown>
}

/** 置信度等级 */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

/** 类型兼容性标签 */
export type CompatibilityLabel = 'exact' | 'coercible' | 'incompatible'

/** 批量拖拽预览条目 */
export interface BatchPreviewItem {
  sourceField: string
  targetField: string
  matchType: 'exact-name' | 'normalized-name' | 'order'
  compatibilityLabel: CompatibilityLabel
}

/** 嵌套字段树节点 */
export interface NestedFieldNode {
  path: string
  leafKey: string
  schema: TypeSchema
  required: boolean
  depth: number
  isExpanded: boolean
  isLeaf: boolean
  isMapped: boolean
  children?: NestedFieldNode[]
}

/** 智能映射建议 */
export interface MappingSuggestion {
  sourceField: string
  targetField: string
  sourceTypeLabel: string
  targetTypeLabel: string
  score: number
  nameScore: number
  semanticScore: number
  typeScore: number
  confidenceLevel: ConfidenceLevel
  compatibilityLabel: CompatibilityLabel
  suggestedCoercion?: TypeCoercionConfig
}

/** 用户确认后的映射（区别于 CandidateFieldMapping 的 WASM 候选） */
export interface FieldMapping {
  sourceField: string
  targetField: string
  compatLevel: 'L0' | 'L1'
  autoRecommended: boolean
  confidence?: number
  required?: boolean
  coercionConfig?: TypeCoercionConfig
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

export interface BlockPort {
  id: string
  label: string
  dataType: PortDataType
  sourceNodeId?: string
  sourcePortId?: string
}

export interface BlockDefinition {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  inputPorts: BlockPort[]
  outputPorts: BlockPort[]
  viewport?: { x: number; y: number; zoom: number }
}

export interface BlockNodeData extends CanvasNodeData {
  blockId?: string
  blockName: string
  blockDefinition: BlockDefinition
  isExpanded: boolean
}

export type BlockCategory = 'analysis' | 'content' | 'development' | 'automation' | 'reporting'

export interface AddNodeInput {
  id: string
  nodeType: NodeType
  category: NodeCategory
  position: XYPosition
  label?: string
  description?: string
  config?: Record<string, unknown>
  inputPorts?: PortDefinition[]
  outputPorts?: PortDefinition[]
  mcpToolDefinitionId?: string
  blockId?: string
  blockName?: string
  blockDefinition?: BlockDefinition
  isExpanded?: boolean
}

export interface PaletteNodeItem {
  type: NodeType
  label: string
  category: NodeCategory
  icon: string
  description: string
  searchText?: string
  mcpToolDefinitionId?: string
  inputPorts?: PortDefinition[]
  outputPorts?: PortDefinition[]
  inputSchema?: Record<string, unknown>
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

export interface CanvasContextMenuState {
  x: number
  y: number
  nodeId?: string
}

export type RoutingStrategy =
  | 'TOKEN_OPTIMIZED'
  | 'COST_OPTIMIZED'
  | 'QUALITY_FIRST'
  | 'LATENCY_FIRST'
  | 'HISTORICAL_BEST'
  | 'FALLBACK_CHAIN'

export interface SmartRoutingNodeData extends CanvasNodeData {
  strategy: RoutingStrategy
  tokenThreshold?: number
  fallbackPriority?: string[]
  modelConfigIds?: string[]
}

export type { NodeType, PortDefinition, CreatePortOptions } from './types/nodeTypeRegistry'
export type { PortDataType, TypeSchema } from './types/typeSchema'
