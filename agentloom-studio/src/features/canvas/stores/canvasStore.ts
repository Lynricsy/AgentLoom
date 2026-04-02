import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { enableMapSet } from 'immer'
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Viewport,
} from '@xyflow/react'
import type { CanvasNode, CanvasEdge, CanvasEdgeData, CanvasSnapshot, AddNodeInput, FieldMapping, AgentNodeData } from '../types'
import { createDefaultEdgeData, createDefaultAgentNodeData } from '../types'
import {
  clonePortDefinitions,
  getNodeTypeConfig,
  getNodeTypeConfigOrNull,
} from '../types/nodeTypeRegistry'
import {
  arePortDataTypesCompatible,
  evaluateConnection,
  mergeEdgeDataWithStoredMappings,
  resolveConnectionPorts,
} from '../lib/connectionCompatibility'
import { getNodePortContractSignature } from '../lib/typeEngine/serialize'
import {
  buildCompoundChildExtent,
  clampPositionToExtent,
  getCompoundInitialChildPosition,
  resolveCompoundContainerSize,
} from '../lib/compoundLayout'
import type { NodeType } from '../types/nodeTypeRegistry'
import {
  buildConditionInputPorts,
  buildConditionOutputPorts,
  getConditionValueInputPorts,
  migrateConditionConfig,
  parseMergeNodeConfig,
  buildMergeInputPorts,
} from '../types/condition.types'
import {
  buildIterationInputPorts,
  buildIterationStartOutputPorts,
  buildLoopInputPorts,
  buildLoopStartOutputPorts,
  buildCompoundOutputPorts,
  createDefaultIterationNodeConfig,
  createDefaultIterationStartNodeConfig,
  createDefaultLoopCompoundNodeConfig,
  createDefaultLoopStartNodeConfig,
  isCompoundContainerNodeType,
} from '../types/controlFlow.types'

enableMapSet()

const AGENT_NODE_TYPES: ReadonlySet<NodeType> = new Set(['chat-agent'])
function isAgentNodeType(nodeType: string): boolean {
  return AGENT_NODE_TYPES.has(nodeType as NodeType)
}

function readNumericNodeDimension(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function findLastIndex<T>(arr: readonly T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!)) return i
  }
  return -1
}

const MAX_UNDO_STACK_SIZE = 10

interface FieldMappingSnapshot {
  edgeId: string
  mappings: FieldMapping[]
}

interface CanvasState {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport
  selectedNodeId: string | null
  selectedNodeIds: Set<string>
  selectedEdgeId: string | null
  mappingPanelEdgeId: string | null
  isDirty: boolean
  lastSavedAt: Date | null
  isSaving: boolean
  workflowId: string | null
  version: number
  isSearchOpen: boolean
  searchQuery: string
  searchMatchIds: string[]
  currentSearchIndex: number
  isMiniMapCollapsed: boolean
  hoveredNodeId: string | null
  nodeValidationErrors: Record<string, boolean>
  fieldMappingUndoStack: FieldMappingSnapshot[]
}

interface CanvasActions {
  actions: {
    onNodesChange: (changes: NodeChange<CanvasNode>[]) => void
    onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void
    createConnection: (connection: Connection, edgeData: CanvasEdgeData) => void
    addNode: (input: AddNodeInput) => void
    deleteSelectedNode: () => void
    toggleNodeSelection: (nodeId: string) => void
    selectNodes: (nodeIds: string[]) => void
    clearSelection: () => void
    deleteSelectedNodes: () => void
    selectNode: (nodeId: string | null) => void
    selectEdge: (edgeId: string | null) => void
    openFieldMapping: (edgeId: string) => void
    closeFieldMapping: () => void
    updateEdgeData: (edgeId: string, patch: Partial<CanvasEdgeData>) => void
    refreshEdgeCompatibility: (
      updates: Array<{ edgeId: string; edgeData: CanvasEdgeData }>,
    ) => void
    updateFieldMapping: (edgeId: string, mappings: FieldMapping[]) => void
    batchUpdateFieldMappings: (edgeId: string, mappings: FieldMapping[]) => void
    saveMappingSnapshot: (edgeId: string) => void
    undoFieldMapping: (edgeId: string) => void
    setViewport: (viewport: Viewport) => void
    commitViewport: (viewport: Viewport) => void
    applyServerSnapshot: (snapshot: CanvasSnapshot & { workflowId: string; version: number }) => void
    markSaved: (version: number) => void
    advanceVersion: (version: number) => void
    setIsSaving: (saving: boolean) => void
    reset: () => void
    toggleSearch: () => void
    setSearchQuery: (query: string) => void
    nextSearchResult: () => void
    prevSearchResult: () => void
    clearSearch: () => void
    toggleMiniMap: () => void
    setHoveredNodeId: (nodeId: string | null) => void
    updateNodeData: (nodeId: string, patch: Partial<CanvasNode['data']>) => void
    setNodeValidationError: (nodeId: string, hasErrors: boolean) => void
    clearNodeValidationErrors: (nodeId: string) => void
  }
}

function collectPortIds(ports: readonly { id: string }[]): Set<string> {
  return new Set(ports.map((port) => port.id))
}

function collectDescendantNodeIds(
  nodes: readonly CanvasNode[],
  rootNodeIds: readonly string[],
): Set<string> {
  const collected = new Set(rootNodeIds)
  let changed = true

  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.parentId && collected.has(node.parentId) && !collected.has(node.id)) {
        collected.add(node.id)
        changed = true
      }
    }
  }

  return collected
}

function syncCompoundParentOutputPorts(
  nodes: CanvasNode[],
  parentNodeId: string,
): void {
  const parentNode = nodes.find((node) => node.id === parentNodeId)
  if (!parentNode) {
    return
  }

  if (parentNode.data.nodeType !== 'loop' && parentNode.data.nodeType !== 'iteration') {
    return
  }

  const outputKeys = nodes
    .filter((node) => node.parentId === parentNodeId && node.data.nodeType === 'result')
    .map((node) => {
      const outputKey = node.data.config?.outputKey
      return typeof outputKey === 'string' && outputKey.trim().length > 0
        ? outputKey.trim()
        : 'result'
    })
    .filter((value, index, items) => items.indexOf(value) === index)

  parentNode.data.outputPorts = buildCompoundOutputPorts(outputKeys)
}

function syncCompoundParentLayout(
  nodes: CanvasNode[],
  parentNodeId: string,
): void {
  const parentNode = nodes.find((node) => node.id === parentNodeId)
  if (!parentNode || !isCompoundContainerNodeType(parentNode.data.nodeType)) {
    return
  }

  const isCollapsed = parentNode.data.config?.isCollapsed === true
  const parentSize = resolveCompoundContainerSize({
    inputPortCount: parentNode.data.inputPorts.length,
    outputPortCount: parentNode.data.outputPorts.length,
    width:
      readNumericNodeDimension(parentNode.style?.width)
      ?? readNumericNodeDimension(parentNode.width),
    height:
      readNumericNodeDimension(parentNode.style?.height)
      ?? readNumericNodeDimension(parentNode.height),
    isCollapsed,
  })

  parentNode.style = {
    ...(parentNode.style ?? {}),
    width: parentSize.width,
    height: parentSize.height,
  }

  if (isCollapsed) {
    return
  }

  const extent = buildCompoundChildExtent({
    inputPortCount: parentNode.data.inputPorts.length,
    outputPortCount: parentNode.data.outputPorts.length,
    width: parentSize.width,
    height: parentSize.height,
  })

  for (const childNode of nodes) {
    if (childNode.parentId !== parentNodeId) {
      continue
    }

    childNode.extent = extent
    childNode.expandParent = true
    childNode.position = clampPositionToExtent(childNode.position, extent)
  }
}

function createInitialState(): CanvasState {
  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,
    selectedNodeIds: new Set<string>(),
    selectedEdgeId: null,
    mappingPanelEdgeId: null,
    isDirty: false,
    lastSavedAt: null,
    isSaving: false,
    workflowId: null,
    version: 1,
    isSearchOpen: false,
    searchQuery: '',
    searchMatchIds: [],
    currentSearchIndex: -1,
    isMiniMapCollapsed: false,
    hoveredNodeId: null,
    nodeValidationErrors: {},
    fieldMappingUndoStack: [],
  }
}

function createEdgeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createNodeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function matchesSearchQuery(node: CanvasNode, lowerQuery: string): boolean {
  return (
    node.data.label.toLowerCase().includes(lowerQuery) ||
    node.data.nodeType.toLowerCase().includes(lowerQuery)
  )
}

export const useCanvasStore = create<CanvasState & CanvasActions>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        ...createInitialState(),

        actions: {
          onNodesChange: (changes) =>
            set((state) => {
              // 钳制 compound 子节点拖拽位置到循环体区域内
              const clampedChanges = changes.map((change) => {
                if (change.type !== 'position' || !change.position) {
                  return change
                }

                const node = state.nodes.find((n) => n.id === change.id)
                if (!node?.parentId) {
                  return change
                }

                const parent = state.nodes.find((n) => n.id === node.parentId)
                if (
                  !parent
                  || !isCompoundContainerNodeType(parent.data.nodeType)
                  || parent.data.config?.isCollapsed === true
                ) {
                  return change
                }

                const extent = buildCompoundChildExtent({
                  inputPortCount: parent.data.inputPorts.length,
                  outputPortCount: parent.data.outputPorts.length,
                  width:
                    readNumericNodeDimension(parent.style?.width)
                    ?? readNumericNodeDimension(parent.width),
                  height:
                    readNumericNodeDimension(parent.style?.height)
                    ?? readNumericNodeDimension(parent.height),
                })

                const clamped = clampPositionToExtent(change.position, extent)
                if (clamped.x !== change.position.x || clamped.y !== change.position.y) {
                  return { ...change, position: clamped }
                }

                return change
              })

              const selectionChanges = clampedChanges.filter(
                (change): change is NodeChange<CanvasNode> & { type: 'select'; selected: boolean } =>
                  change.type === 'select',
              )
              const removedNodeIds = clampedChanges
                .filter(
                  (change): change is NodeChange<CanvasNode> & { type: 'remove' } =>
                    change.type === 'remove',
                )
                .map((change) => change.id)

              state.nodes = applyNodeChanges(clampedChanges, state.nodes)

              // compound 节点 resize 后重新同步子节点 extent
              const resizedCompoundIds = clampedChanges
                .filter(
                  (change): change is NodeChange<CanvasNode> & { type: 'dimensions'; id: string; resizing: boolean } =>
                    change.type === 'dimensions'
                    && 'resizing' in change
                    && change.resizing === false,
                )
                .map((change) => change.id)
                .filter((id) => {
                  const n = state.nodes.find((node) => node.id === id)
                  return n && isCompoundContainerNodeType(n.data.nodeType)
                })

              for (const compoundId of resizedCompoundIds) {
                syncCompoundParentLayout(state.nodes, compoundId)
              }
              if (removedNodeIds.length > 0) {
                for (const nodeId of removedNodeIds) {
                  delete state.nodeValidationErrors[nodeId]
                }
              }
              const isDirtyChange = clampedChanges.some(
                (c) =>
                  c.type === 'remove' ||
                  c.type === 'add' ||
                  (c.type === 'position' && c.dragging === false) ||
                  (c.type === 'dimensions' && 'resizing' in c && c.resizing === false)
              )
              if (isDirtyChange) {
                state.isDirty = true
              }

              if (selectionChanges.length > 0 || removedNodeIds.length > 0) {
                const nextSelectedNodeIds = new Set(
                  state.nodes.filter((node) => node.selected).map((node) => node.id),
                )
                const lastSelectedChange = [...selectionChanges]
                  .reverse()
                  .find((change) => change.selected)

                state.selectedNodeIds = nextSelectedNodeIds

                if (nextSelectedNodeIds.size === 0) {
                  state.selectedNodeId = null
                } else if (lastSelectedChange) {
                  state.selectedNodeId = lastSelectedChange.id
                  state.selectedEdgeId = null
                } else if (!state.selectedNodeId || !nextSelectedNodeIds.has(state.selectedNodeId)) {
                  state.selectedNodeId = Array.from(nextSelectedNodeIds).at(-1) ?? null
                }
              }
            }),

          onEdgesChange: (changes) =>
            set((state) => {
              // 拦截不兼容端口类型的 add 变更（v12 通过 onEdgesChange 自动添加边）
              const filteredChanges = changes.filter((c) => {
                if (c.type !== 'add') {
                  return true
                }

                const edge = c.item
                const sourceNode = state.nodes.find((n) => n.id === edge.source)
                const targetNode = state.nodes.find((n) => n.id === edge.target)
                if (!sourceNode || !targetNode) {
                  return true
                }

                const sourcePort = sourceNode.data.outputPorts.find(
                  (p) => p.id === edge.sourceHandle,
                )
                const targetPort = targetNode.data.inputPorts.find(
                  (p) => p.id === edge.targetHandle,
                )
                if (!sourcePort || !targetPort) {
                  return true
                }

                return arePortDataTypesCompatible(
                  sourcePort.dataType,
                  targetPort.dataType,
                )
              })

              const removedIds = filteredChanges
                .filter((c): c is EdgeChange<CanvasEdge> & { type: 'remove' } => c.type === 'remove')
                .map((c) => c.id)

              if (removedIds.length > 0) {
                const removedEdges = state.edges.filter((e) => removedIds.includes(e.id))
                for (const edge of removedEdges) {
                  const targetNode = state.nodes.find((n) => n.id === edge.target)
                  if (targetNode && isAgentNodeType(targetNode.data.nodeType)) {
                    const agentData = targetNode.data as AgentNodeData
                    const handle = edge.targetHandle
                    if (handle === 'tools') {
                      agentData.toolBindings = (agentData.toolBindings ?? []).filter(
                        (id) => id !== edge.source,
                      )
                    } else if (handle === 'knowledge') {
                      agentData.knowledgeBindings = (agentData.knowledgeBindings ?? []).filter(
                        (id) => id !== edge.source,
                      )
                    } else if (handle === 'model-in') {
                      agentData.modelConfig = {
                        ...agentData.modelConfig,
                        connectedModelNodeId: null,
                      }
                    }
                  }
                }
              }

              state.edges = applyEdgeChanges(filteredChanges, state.edges)
              const isDirtyChange = filteredChanges.some(
                (c) => c.type === 'remove' || c.type === 'add'
              )
              if (isDirtyChange) {
                state.isDirty = true
              }
              if (removedIds.length > 0) {
                if (state.selectedEdgeId && removedIds.includes(state.selectedEdgeId)) {
                  state.selectedEdgeId = null
                }
                if (state.mappingPanelEdgeId && removedIds.includes(state.mappingPanelEdgeId)) {
                  state.mappingPanelEdgeId = null
                }
              }
            }),

          createConnection: (connection, edgeData) =>
            set((state) => {
              if (!connection.source || !connection.target) {
                return
              }

              const duplicateEdge = state.edges.some(
                (edge) =>
                  edge.source === connection.source &&
                  edge.target === connection.target &&
                  edge.sourceHandle === connection.sourceHandle &&
                  edge.targetHandle === connection.targetHandle
              )

              if (duplicateEdge) {
                return
              }

              state.edges.push({
                id: createEdgeId(),
                type: 'smart',
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle ?? undefined,
                targetHandle: connection.targetHandle ?? undefined,
                data: edgeData,
              })
              state.isDirty = true

              const targetNode = state.nodes.find((n) => n.id === connection.target)
              if (targetNode && isAgentNodeType(targetNode.data.nodeType)) {
                const agentData = targetNode.data as AgentNodeData
                const handle = connection.targetHandle
                if (handle === 'tools') {
                  agentData.toolBindings = [...(agentData.toolBindings ?? []), connection.source]
                } else if (handle === 'knowledge') {
                  agentData.knowledgeBindings = [...(agentData.knowledgeBindings ?? []), connection.source]
                } else if (handle === 'model-in') {
                  agentData.modelConfig = {
                    ...agentData.modelConfig,
                    connectedModelNodeId: connection.source,
                  }
                }
              }
            }),

          addNode: (input) =>
            set((state) => {
              const config = getNodeTypeConfig(input.nodeType)
              const nextResultOutputKey =
                input.parentId && input.nodeType === 'result'
                  ? (() => {
                      const siblingKeys = state.nodes
                        .filter((node) => node.parentId === input.parentId && node.data.nodeType === 'result')
                        .map((node) => {
                          const outputKey = node.data.config?.outputKey
                          return typeof outputKey === 'string' && outputKey.trim().length > 0
                            ? outputKey.trim()
                            : 'result'
                        })
                      if (!siblingKeys.includes('result')) {
                        return 'result'
                      }

                      let suffix = 2
                      while (siblingKeys.includes(`result_${suffix}`)) {
                        suffix += 1
                      }
                      return `result_${suffix}`
                    })()
                  : null
              const nextConfig = (
                input.config
                ?? (input.nodeType === 'iteration'
                  ? createDefaultIterationNodeConfig()
                  : input.nodeType === 'loop'
                    ? createDefaultLoopCompoundNodeConfig()
                    : input.nodeType === 'result' && nextResultOutputKey
                      ? { outputKey: nextResultOutputKey }
                    : {})
              ) as Record<string, unknown>
              const nextInputPorts =
                input.inputPorts
                ?? (input.nodeType === 'iteration'
                  ? buildIterationInputPorts()
                  : input.nodeType === 'loop'
                    ? buildLoopInputPorts()
                    : config.inputPorts)
              const node: CanvasNode = {
                id: input.id,
                type: input.category,
                position: input.position,
                ...(input.parentId ? { parentId: input.parentId } : {}),
                ...(input.extent ? { extent: input.extent } : {}),
                ...(input.expandParent !== undefined ? { expandParent: input.expandParent } : {}),
                ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
                ...(input.style ? { style: input.style } : {}),
                data: {
                  label: input.label ?? input.blockName ?? config.label,
                  nodeType: input.nodeType,
                  category: input.category,
                  description: input.description ?? config.description,
                  config: nextConfig,
                  inputPorts: clonePortDefinitions(nextInputPorts),
                  outputPorts: clonePortDefinitions(input.outputPorts ?? config.outputPorts),
                  ...(input.mcpToolDefinitionId ? { mcpToolDefinitionId: input.mcpToolDefinitionId } : {}),
                  ...(isAgentNodeType(input.nodeType) ? createDefaultAgentNodeData() : {}),
                  ...(input.blockId ? { blockId: input.blockId } : {}),
                  ...(input.blockName ? { blockName: input.blockName } : {}),
                  ...(input.blockDefinition ? { blockDefinition: input.blockDefinition } : {}),
                  ...(input.nodeType === 'reusable-block' ? { isExpanded: input.isExpanded ?? false } : {}),
                },
              }
              state.nodes.push(node)

              if (input.nodeType === 'loop' || input.nodeType === 'iteration') {
                const extraInputIds = node.data.inputPorts
                  .filter((port) => port.id.startsWith('input-'))
                  .map((port) => port.id)
                const startNodeType =
                  input.nodeType === 'loop' ? 'loop-start' : 'iteration-start'
                const startNodeOutputPorts =
                  input.nodeType === 'loop'
                    ? buildLoopStartOutputPorts(
                        extraInputIds,
                        createDefaultLoopStartNodeConfig(),
                      )
                    : buildIterationStartOutputPorts(
                        extraInputIds,
                        createDefaultIterationStartNodeConfig(),
                      )
                const startNodeConfigMeta = getNodeTypeConfig(startNodeType)
                const startNodePosition = getCompoundInitialChildPosition({
                  inputPortCount: node.data.inputPorts.length,
                  outputPortCount: node.data.outputPorts.length,
                })

                state.nodes.push({
                  id: createNodeId(),
                  type: 'control',
                  parentId: input.id,
                  position: startNodePosition,
                  data: {
                    label: startNodeConfigMeta.label,
                    nodeType: startNodeType,
                    category: 'control',
                    description: startNodeConfigMeta.description,
                    config:
                      input.nodeType === 'loop'
                        ? ({
                            ...createDefaultLoopStartNodeConfig(),
                          } as Record<string, unknown>)
                        : ({
                            ...createDefaultIterationStartNodeConfig(),
                          } as Record<string, unknown>),
                    inputPorts: clonePortDefinitions(startNodeConfigMeta.inputPorts),
                    outputPorts: clonePortDefinitions(startNodeOutputPorts),
                  },
                })
              }

              if (input.parentId && input.nodeType === 'result') {
                syncCompoundParentOutputPorts(state.nodes, input.parentId)
              }

              if (input.nodeType === 'loop' || input.nodeType === 'iteration') {
                syncCompoundParentLayout(state.nodes, input.id)
              } else if (input.parentId) {
                syncCompoundParentLayout(state.nodes, input.parentId)
              }

              state.isDirty = true
            }),

          deleteSelectedNode: () =>
            set((state) => {
              if (!state.selectedNodeId) return
              const selectedNode = state.nodes.find((node) => node.id === state.selectedNodeId)
              if (
                selectedNode?.data.nodeType === 'loop-start' ||
                selectedNode?.data.nodeType === 'iteration-start'
              ) {
                return
              }

              const nodeIdsToDelete = collectDescendantNodeIds(
                state.nodes,
                [state.selectedNodeId],
              )
              const nextSelectedNodeIds = new Set(state.selectedNodeIds)
              for (const nodeId of nodeIdsToDelete) {
                nextSelectedNodeIds.delete(nodeId)
              }
              const removedEdgeIds = new Set(
                state.edges
                  .filter((edge) => nodeIdsToDelete.has(edge.source) || nodeIdsToDelete.has(edge.target))
                  .map((edge) => edge.id),
              )
              const affectedParentIds = state.nodes
                .filter((node) => node.parentId && nodeIdsToDelete.has(node.id))
                .map((node) => node.parentId as string)
              state.nodes = state.nodes.filter((n) => !nodeIdsToDelete.has(n.id))
              state.edges = state.edges.filter(
                (e) => !nodeIdsToDelete.has(e.source) && !nodeIdsToDelete.has(e.target)
              )
              for (const parentId of affectedParentIds) {
                syncCompoundParentOutputPorts(state.nodes, parentId)
                syncCompoundParentLayout(state.nodes, parentId)
              }
              state.selectedNodeIds = nextSelectedNodeIds
              state.selectedNodeId = Array.from(nextSelectedNodeIds).at(-1) ?? null
              if (state.selectedEdgeId && removedEdgeIds.has(state.selectedEdgeId)) {
                state.selectedEdgeId = null
              }
              if (state.mappingPanelEdgeId && removedEdgeIds.has(state.mappingPanelEdgeId)) {
                state.mappingPanelEdgeId = null
              }
              for (const nodeId of nodeIdsToDelete) {
                delete state.nodeValidationErrors[nodeId]
              }
              state.isDirty = true
            }),

          toggleNodeSelection: (nodeId) =>
            set((state) => {
              const nextSelectedNodeIds = new Set(state.selectedNodeIds)
              const wasSelected = nextSelectedNodeIds.has(nodeId)

              if (wasSelected) {
                nextSelectedNodeIds.delete(nodeId)
              } else {
                nextSelectedNodeIds.add(nodeId)
              }

              state.selectedNodeIds = nextSelectedNodeIds
              state.selectedNodeId = wasSelected
                ? Array.from(nextSelectedNodeIds).at(-1) ?? null
                : nodeId
              state.selectedEdgeId = null
            }),

          selectNodes: (nodeIds) =>
            set((state) => {
              state.selectedNodeIds = new Set(nodeIds)
              state.selectedNodeId = nodeIds.length > 0 ? nodeIds[nodeIds.length - 1]! : null
              state.selectedEdgeId = null
            }),

          clearSelection: () =>
            set((state) => {
              state.selectedNodeIds = new Set()
              state.selectedNodeId = null
              state.selectedEdgeId = null
            }),

          deleteSelectedNodes: () =>
            set((state) => {
              if (state.selectedNodeIds.size === 0) return

              const protectedNodeIds = new Set(
                state.nodes
                  .filter(
                    (node) =>
                      state.selectedNodeIds.has(node.id) &&
                      (node.data.nodeType === 'loop-start' || node.data.nodeType === 'iteration-start'),
                  )
                  .map((node) => node.id),
              )
              const requestedNodeIds = Array.from(state.selectedNodeIds).filter(
                (nodeId) => !protectedNodeIds.has(nodeId),
              )
              const nodeIdsToDelete = collectDescendantNodeIds(
                state.nodes,
                requestedNodeIds,
              )
              if (nodeIdsToDelete.size === 0) return
              const removedEdgeIds = new Set(
                state.edges
                  .filter((edge) => nodeIdsToDelete.has(edge.source) || nodeIdsToDelete.has(edge.target))
                  .map((edge) => edge.id),
              )
              const affectedParentIds = state.nodes
                .filter((node) => node.parentId && nodeIdsToDelete.has(node.id))
                .map((node) => node.parentId as string)

              state.nodes = state.nodes.filter((node) => !nodeIdsToDelete.has(node.id))
              state.edges = state.edges.filter(
                (edge) => !nodeIdsToDelete.has(edge.source) && !nodeIdsToDelete.has(edge.target),
              )
              for (const parentId of affectedParentIds) {
                syncCompoundParentOutputPorts(state.nodes, parentId)
                syncCompoundParentLayout(state.nodes, parentId)
              }

              for (const nodeId of nodeIdsToDelete) {
                delete state.nodeValidationErrors[nodeId]
              }

              state.selectedNodeIds = new Set()
              state.selectedNodeId = null

              if (state.selectedEdgeId && removedEdgeIds.has(state.selectedEdgeId)) {
                state.selectedEdgeId = null
              }
              if (state.mappingPanelEdgeId && removedEdgeIds.has(state.mappingPanelEdgeId)) {
                state.mappingPanelEdgeId = null
              }

              state.isDirty = true
            }),

          selectNode: (nodeId) =>
            set((state) => {
              state.selectedNodeId = nodeId
              state.selectedNodeIds = nodeId ? new Set([nodeId]) : new Set()
              if (nodeId) state.selectedEdgeId = null
            }),

          selectEdge: (edgeId) =>
            set((state) => {
              state.selectedEdgeId = edgeId
              if (edgeId) {
                state.selectedNodeId = null
                state.selectedNodeIds = new Set()
              }
            }),

          openFieldMapping: (edgeId) =>
            set((state) => {
              state.mappingPanelEdgeId = edgeId
              state.selectedEdgeId = edgeId
              state.selectedNodeId = null
              state.selectedNodeIds = new Set()
            }),

          closeFieldMapping: () =>
            set((state) => {
              state.mappingPanelEdgeId = null
            }),

          updateEdgeData: (edgeId, patch) =>
            set((state) => {
              const edge = state.edges.find((e) => e.id === edgeId)
              if (!edge) return
              edge.data = { ...(edge.data ?? createDefaultEdgeData()), ...patch }
              state.isDirty = true
            }),

          refreshEdgeCompatibility: (updates) =>
            set((state) => {
              if (updates.length === 0) {
                return
              }

              let touched = false
              for (const update of updates) {
                const edge = state.edges.find((candidate) => candidate.id === update.edgeId)
                if (!edge) {
                  continue
                }

                edge.data = update.edgeData
                touched = true
              }

              if (touched) {
                state.isDirty = true
              }
            }),

          updateFieldMapping: (edgeId, mappings) =>
            set((state) => {
              const edge = state.edges.find((e) => e.id === edgeId)
              if (!edge) return
              const data = edge.data ?? createDefaultEdgeData()
              data.fieldMapping = mappings
              data.mappingSummary = {
                autoMatchedCount: mappings.filter((m) => m.autoRecommended).length,
                manualCount: mappings.filter((m) => !m.autoRecommended).length,
                requiredUnmappedCount: data.missingFields.filter(
                  (f) => f.required && !mappings.some((m) => m.targetField === f.path)
                ).length,
              }
              edge.data = data
              state.isDirty = true
            }),

          batchUpdateFieldMappings: (edgeId, mappings) =>
            set((state) => {
              const edge = state.edges.find((e) => e.id === edgeId)
              if (!edge) return
              const data = edge.data ?? createDefaultEdgeData()
              data.fieldMapping = mappings
              data.mappingSummary = {
                autoMatchedCount: mappings.filter((m) => m.autoRecommended).length,
                manualCount: mappings.filter((m) => !m.autoRecommended).length,
                requiredUnmappedCount: data.missingFields.filter(
                  (f) => f.required && !mappings.some((m) => m.targetField === f.path)
                ).length,
              }
              edge.data = data
              state.isDirty = true
            }, false, 'store/batchUpdateFieldMappings'),

          saveMappingSnapshot: (edgeId) =>
            set((state) => {
              const edge = state.edges.find((e) => e.id === edgeId)
              if (!edge?.data) return
              const snapshot: FieldMappingSnapshot = {
                edgeId,
                mappings: [...edge.data.fieldMapping],
              }
              state.fieldMappingUndoStack.push(snapshot)
              if (state.fieldMappingUndoStack.length > MAX_UNDO_STACK_SIZE) {
                state.fieldMappingUndoStack.splice(0, state.fieldMappingUndoStack.length - MAX_UNDO_STACK_SIZE)
              }
            }, false, 'store/saveMappingSnapshot'),

          undoFieldMapping: (edgeId) =>
            set((state) => {
              const lastIndex = findLastIndex(state.fieldMappingUndoStack, (s) => s.edgeId === edgeId)
              if (lastIndex === -1) return
              const snapshot = state.fieldMappingUndoStack[lastIndex]!
              state.fieldMappingUndoStack.splice(lastIndex, 1)

              const edge = state.edges.find((e) => e.id === edgeId)
              if (!edge) return
              const data = edge.data ?? createDefaultEdgeData()
              const mappings = snapshot.mappings
              data.fieldMapping = mappings
              data.mappingSummary = {
                autoMatchedCount: mappings.filter((m) => m.autoRecommended).length,
                manualCount: mappings.filter((m) => !m.autoRecommended).length,
                requiredUnmappedCount: data.missingFields.filter(
                  (f) => f.required && !mappings.some((m) => m.targetField === f.path)
                ).length,
              }
              edge.data = data
              state.isDirty = true
            }, false, 'store/undoFieldMapping'),

          setViewport: (viewport) =>
            set((state) => {
              state.viewport = viewport
            }),

          commitViewport: (viewport) =>
            set((state) => {
              state.viewport = viewport
              state.isDirty = true
            }),

          applyServerSnapshot: ({ nodes, edges, viewport, workflowId, version }) => {
            invalidateEdgeCompatibilityRefreshVersion()

            set((state) => {
              const rawNodesById = new Map(nodes.map((node) => [node.id, node]))
              state.nodes = nodes.map((n) => {
                const typeConfig = getNodeTypeConfigOrNull(n.data.nodeType)
                const agentNodeDefaults = isAgentNodeType(n.data.nodeType)
                  ? createDefaultAgentNodeData()
                  : null
                const agentNodeData = agentNodeDefaults
                  ? (n.data as Partial<AgentNodeData>)
                  : null
                let inputPorts = Array.isArray(n.data.inputPorts)
                  ? clonePortDefinitions(n.data.inputPorts)
                  : typeConfig
                    ? clonePortDefinitions(typeConfig.inputPorts)
                    : []
                let outputPorts = Array.isArray(n.data.outputPorts)
                  ? clonePortDefinitions(n.data.outputPorts)
                  : typeConfig
                    ? clonePortDefinitions(typeConfig.outputPorts)
                    : []

                // 条件节点: 从 config.branches 推导输出端口（兼容旧格式迁移）
                if (n.data.nodeType === 'condition') {
                  const condConfig = migrateConditionConfig(n.data.config ?? {})
                  const currentValuePorts = getConditionValueInputPorts(inputPorts)
                  const normalizedPortIds = currentValuePorts.map((port, index) =>
                    port.id.startsWith('input-') ? port.id : `input-${index}`,
                  )
                  inputPorts = buildConditionInputPorts(
                    Math.max(1, normalizedPortIds.length),
                    normalizedPortIds.length > 0 ? normalizedPortIds : undefined,
                  )
                  outputPorts = buildConditionOutputPorts(condConfig.branches)
                }

                // 合并节点: 从 config.inputCount 推导输入端口
                if (n.data.nodeType === 'merge') {
                  const mergeConfig = parseMergeNodeConfig(n.data.config ?? {})
                  inputPorts = buildMergeInputPorts(mergeConfig.inputCount, mergeConfig.portLabels)
                }

                if (
                  (n.data.nodeType === 'loop-start' || n.data.nodeType === 'iteration-start')
                  && n.parentId
                ) {
                  const parentNode = rawNodesById.get(n.parentId)
                  const parentInputPorts = Array.isArray(parentNode?.data?.inputPorts)
                    ? parentNode.data.inputPorts
                    : []
                  const extraInputIds = parentInputPorts
                    .filter((port) => port.id.startsWith('input-'))
                    .map((port) => port.id)

                  outputPorts = n.data.nodeType === 'loop-start'
                    ? buildLoopStartOutputPorts(
                        extraInputIds,
                        {
                          ...createDefaultLoopStartNodeConfig(),
                          ...(n.data.config ?? {}),
                        } as ReturnType<typeof createDefaultLoopStartNodeConfig>,
                      )
                    : buildIterationStartOutputPorts(
                        extraInputIds,
                        {
                          ...createDefaultIterationStartNodeConfig(),
                          ...(n.data.config ?? {}),
                        } as ReturnType<typeof createDefaultIterationStartNodeConfig>,
                      )
                }

                return {
                  ...n,
                  data: {
                    ...(agentNodeDefaults ?? {}),
                    ...n.data,
                    config: n.data.config ?? {},
                    inputPorts,
                    outputPorts,
                    ...(agentNodeDefaults && agentNodeData
                      ? {
                          modelConfig: agentNodeData.modelConfig
                            ? { ...agentNodeData.modelConfig }
                            : agentNodeDefaults.modelConfig,
                          autonomyConfig: {
                            ...agentNodeDefaults.autonomyConfig,
                            ...(agentNodeData.autonomyConfig ?? {}),
                          },
                          outputFormatStrategy: agentNodeData.outputFormatStrategy
                            ? { ...agentNodeData.outputFormatStrategy }
                            : agentNodeDefaults.outputFormatStrategy,
                          toolBindings: Array.isArray(agentNodeData.toolBindings)
                            ? [...agentNodeData.toolBindings]
                            : [...agentNodeDefaults.toolBindings],
                          knowledgeBindings: Array.isArray(agentNodeData.knowledgeBindings)
                            ? [...agentNodeData.knowledgeBindings]
                            : [...agentNodeDefaults.knowledgeBindings],
                        }
                      : {}),
                  },
                }
              })
              for (const node of state.nodes) {
                if (!isCompoundContainerNodeType(node.data.nodeType)) {
                  continue
                }

                syncCompoundParentOutputPorts(state.nodes, node.id)
                syncCompoundParentLayout(state.nodes, node.id)
              }
              state.edges = edges.map((e) => ({
                ...e,
                data: { ...createDefaultEdgeData(), ...(e.data ?? {}) },
              }))
              state.viewport = viewport ?? { x: 0, y: 0, zoom: 1 }
              state.workflowId = workflowId
              state.version = version
              state.isDirty = false
              state.selectedNodeId = null
              state.selectedNodeIds = new Set()
              state.selectedEdgeId = null
              state.mappingPanelEdgeId = null
              state.nodeValidationErrors = {}
            })
          },

          markSaved: (version) =>
            set((state) => {
              state.isDirty = false
              state.lastSavedAt = new Date()
              state.isSaving = false
              state.version = version
            }),

          advanceVersion: (version) =>
            set((state) => {
              state.version = version
              state.isSaving = false
            }),

          setIsSaving: (saving) =>
            set((state) => {
              state.isSaving = saving
            }),

          reset: () => {
            invalidateEdgeCompatibilityRefreshVersion()

            set((state) => {
              Object.assign(state, createInitialState())
            })
          },

          toggleSearch: () =>
            set((state) => {
              state.isSearchOpen = !state.isSearchOpen
              if (!state.isSearchOpen) {
                state.searchQuery = ''
                state.searchMatchIds = []
                state.currentSearchIndex = -1
              }
            }),

          setSearchQuery: (query) =>
            set((state) => {
              state.searchQuery = query
              if (!query.trim()) {
                state.searchMatchIds = []
                state.currentSearchIndex = -1
                return
              }
              const lowerQuery = query.toLowerCase()
              state.searchMatchIds = state.nodes.filter((n) => matchesSearchQuery(n, lowerQuery)).map((n) => n.id)
              state.currentSearchIndex = state.searchMatchIds.length > 0 ? 0 : -1
            }),

          nextSearchResult: () =>
            set((state) => {
              if (state.searchMatchIds.length === 0) return
              state.currentSearchIndex =
                (state.currentSearchIndex + 1) % state.searchMatchIds.length
            }),

          prevSearchResult: () =>
            set((state) => {
              if (state.searchMatchIds.length === 0) return
              state.currentSearchIndex =
                (state.currentSearchIndex - 1 + state.searchMatchIds.length) %
                state.searchMatchIds.length
            }),

          clearSearch: () =>
            set((state) => {
              state.isSearchOpen = false
              state.searchQuery = ''
              state.searchMatchIds = []
              state.currentSearchIndex = -1
            }),

          toggleMiniMap: () =>
            set((state) => {
              state.isMiniMapCollapsed = !state.isMiniMapCollapsed
            }),

          setHoveredNodeId: (nodeId) =>
            set((state) => {
              state.hoveredNodeId = nodeId
            }),

          updateNodeData: (nodeId, patch) =>
            {
              let shouldRevalidate = false
              let revalidationVersion = 0

              set((state) => {
                const node = state.nodes.find((n) => n.id === nodeId)
                if (!node) return

                const previousInputPortIds = collectPortIds(node.data.inputPorts)
                const previousOutputPortIds = collectPortIds(node.data.outputPorts)
                const previousSignature = getNodePortContractSignature({
                  inputPorts: node.data.inputPorts,
                  outputPorts: node.data.outputPorts,
                })
                const nextNodeData = {
                  ...node.data,
                  ...patch,
                }
                const nextInputPortIds = collectPortIds(nextNodeData.inputPorts)
                const nextOutputPortIds = collectPortIds(nextNodeData.outputPorts)
                const nextSignature = getNodePortContractSignature({
                  inputPorts: nextNodeData.inputPorts,
                  outputPorts: nextNodeData.outputPorts,
                })

                Object.assign(node.data, patch)
                state.isDirty = true

                if (isCompoundContainerNodeType(node.data.nodeType)) {
                  syncCompoundParentLayout(state.nodes, nodeId)
                }

                if (previousSignature !== nextSignature) {
                  const removedInputHandles = [...previousInputPortIds].filter(
                    (portId) => !nextInputPortIds.has(portId),
                  )
                  const removedOutputHandles = [...previousOutputPortIds].filter(
                    (portId) => !nextOutputPortIds.has(portId),
                  )

                  if (removedInputHandles.length > 0 || removedOutputHandles.length > 0) {
                    const removedEdgeIds = new Set(
                      state.edges
                        .filter((edge) =>
                          (edge.target === nodeId && removedInputHandles.includes(edge.targetHandle ?? ''))
                          || (edge.source === nodeId && removedOutputHandles.includes(edge.sourceHandle ?? '')),
                        )
                        .map((edge) => edge.id),
                    )

                    if (removedEdgeIds.size > 0) {
                      state.edges = state.edges.filter((edge) => !removedEdgeIds.has(edge.id))
                      if (state.selectedEdgeId && removedEdgeIds.has(state.selectedEdgeId)) {
                        state.selectedEdgeId = null
                      }
                      if (state.mappingPanelEdgeId && removedEdgeIds.has(state.mappingPanelEdgeId)) {
                        state.mappingPanelEdgeId = null
                      }
                    }
                  }
                }

                if (previousSignature !== nextSignature) {
                  shouldRevalidate = true
                  revalidationVersion = nextEdgeCompatibilityRefreshVersion()
                }
              })

              if (shouldRevalidate) {
                void revalidateConnectedEdges(nodeId, revalidationVersion)
              }
            },

          setNodeValidationError: (nodeId, hasErrors) =>
            set((state) => {
              if (hasErrors) {
                state.nodeValidationErrors[nodeId] = true
              } else {
                delete state.nodeValidationErrors[nodeId]
              }
            }),

          clearNodeValidationErrors: (nodeId) =>
            set((state) => {
              delete state.nodeValidationErrors[nodeId]
            }),
        },
      }))
    ),
    { name: 'CanvasStore' }
  )
)

export const useCanvasNodes = () => useCanvasStore((s) => s.nodes)

export const useCanvasEdges = () => useCanvasStore((s) => s.edges)

export const useCanvasActions = () => useCanvasStore((s) => s.actions)

let edgeCompatibilityRefreshVersion = 0

function invalidateEdgeCompatibilityRefreshVersion(): number {
  edgeCompatibilityRefreshVersion += 1
  return edgeCompatibilityRefreshVersion
}

function nextEdgeCompatibilityRefreshVersion(): number {
  return invalidateEdgeCompatibilityRefreshVersion()
}

async function revalidateConnectedEdges(nodeId: string, refreshVersion: number) {
  const snapshot = useCanvasStore.getState()
  const connectedEdges = snapshot.edges.filter(
    (edge) => edge.source === nodeId || edge.target === nodeId,
  )

  if (connectedEdges.length === 0) {
    return
  }

  const updates = await Promise.all(
    connectedEdges.map(async (edge) => {
      const resolved = resolveConnectionPorts(snapshot.nodes, edge)
      const evaluated = await evaluateConnection(
        snapshot.nodes,
        edge,
        snapshot.edges.filter((candidate) => candidate.id !== edge.id),
      )

      const edgeData = resolved
        ? mergeEdgeDataWithStoredMappings(
            resolved.source.port,
            resolved.target.port,
            evaluated.edgeData,
            edge.data ?? createDefaultEdgeData(),
          )
        : evaluated.edgeData

      return {
        edgeId: edge.id,
        edgeData,
      }
    }),
  )

  if (refreshVersion !== edgeCompatibilityRefreshVersion) {
    return
  }

  const latestState = useCanvasStore.getState()
  const latestUpdates = updates.flatMap((update) => {
    const latestEdge = latestState.edges.find((edge) => edge.id === update.edgeId)
    if (!latestEdge) {
      return []
    }

    const resolved = resolveConnectionPorts(latestState.nodes, latestEdge)
    const edgeData = resolved
      ? mergeEdgeDataWithStoredMappings(
          resolved.source.port,
          resolved.target.port,
          update.edgeData,
          latestEdge.data ?? createDefaultEdgeData(),
        )
      : update.edgeData

    return [{
      edgeId: update.edgeId,
      edgeData,
    }]
  })

  if (latestUpdates.length === 0) {
    return
  }

  latestState.actions.refreshEdgeCompatibility(latestUpdates)
}

export const useCanvasSaveStatus = () =>
  useCanvasStore(
    useShallow((s) => ({
      isDirty: s.isDirty,
      isSaving: s.isSaving,
      lastSavedAt: s.lastSavedAt,
    }))
  )

export const useSelectedNodeIds = () => useCanvasStore((s) => s.selectedNodeIds)

export const useSelectedEdgeId = () => useCanvasStore((s) => s.selectedEdgeId)

export const useMappingPanelEdgeId = () => useCanvasStore((s) => s.mappingPanelEdgeId)

export const useEdgeData = (edgeId: string | null) =>
  useCanvasStore((s) => {
    if (!edgeId) return null
    return s.edges.find((e) => e.id === edgeId)?.data ?? null
  })

export const useSearchState = () =>
  useCanvasStore(
    useShallow((s) => ({
      isSearchOpen: s.isSearchOpen,
      searchQuery: s.searchQuery,
      searchMatchIds: s.searchMatchIds,
      currentSearchIndex: s.currentSearchIndex,
    }))
  )

export const useIsMiniMapCollapsed = () => useCanvasStore((s) => s.isMiniMapCollapsed)

export const useHoveredNodeId = () => useCanvasStore((s) => s.hoveredNodeId)

export const useSelectedNodeData = () =>
  useCanvasStore((s) => {
    if (!s.selectedNodeId) return null
    const node = s.nodes.find((n) => n.id === s.selectedNodeId)
    return node?.data ?? null
  })

export const useNodeHasValidationError = (nodeId: string) =>
  useCanvasStore((s) => !!s.nodeValidationErrors[nodeId])
