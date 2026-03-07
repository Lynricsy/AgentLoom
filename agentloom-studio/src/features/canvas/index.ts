export type {
  AddNodeInput,
  CanvasEdge,
  CanvasEdgeData,
  CanvasNode,
  CanvasNodeData,
  CanvasSnapshot,
  CandidateFieldMapping,
  EdgeMappingSummary,
  FieldMapping,
  MissingFieldInfo,
  NodeCategory,
  PaletteGroup,
  PaletteNodeItem,
  RawCompatibilityLevel,
  VisualCompatibilityLevel,
} from './types'
export { createDefaultEdgeData } from './types'
export type {
  NodeConfigFieldSchema,
  NodeConfigSchema,
  NodeType,
  NodeTypeConfig,
  PortDataTypeMeta,
  PortDefinition,
  PortDirection,
  PortShape,
} from './types/nodeTypeRegistry'
export type {
  PortDataType,
  ScalarTypeSchema,
  TypeSchema,
} from './types/typeSchema'
export {
  assertNever,
  PORT_DATA_TYPES,
} from './types/typeSchema'
export {
  NODE_TYPES,
  NODE_TYPE_REGISTRY,
  PORT_DATA_TYPE_META,
  getAllNodeTypes,
  getNodeTypeConfig,
  getNodeTypeConfigOrNull,
  clonePortDefinitions,
} from './types/nodeTypeRegistry'
export {
  useCanvasActions,
  useCanvasEdges,
  useCanvasNodes,
  useCanvasSaveStatus,
  useCanvasStore,
  useEdgeData,
  useMappingPanelEdgeId,
  useSelectedEdgeId,
} from './stores/canvasStore'
export { buildPaletteGroups } from './components/nodeCategories'
export { NodePalette } from './components/NodePalette'
export { TypedPort, type TypedPortProps } from './components/TypedPort'
export { CanvasNodeShell } from './components/CanvasNode'
export { SmartEdge } from './components/edges/SmartEdge'
export { CompatibilityPreview, type CompatibilityPreviewProps } from './components/overlays/CompatibilityPreview'
export { ConnectionStateOverlay, type OverlayHandleSnapshot } from './components/overlays/ConnectionStateOverlay'
export { FieldMappingPanel, type FieldMappingPanelProps } from './components/panels/FieldMappingPanel'
export { WorkflowCanvas } from './components/WorkflowCanvas'
export { WorkflowCanvasPage } from './components/WorkflowCanvasPage'
export { useAutoSave } from './hooks/useAutoSave'
export { useCanvasDrop } from './hooks/useCanvasDrop'
