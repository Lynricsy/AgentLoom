import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Viewport,
} from '@xyflow/react'
import type { CanvasNode, CanvasEdge, CanvasEdgeData, CanvasSnapshot, AddNodeInput, FieldMapping } from '../types'
import { createDefaultEdgeData } from '../types'
import {
  clonePortDefinitions,
  getNodeTypeConfig,
  getNodeTypeConfigOrNull,
} from '../types/nodeTypeRegistry'

interface CanvasState {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport
  selectedNodeId: string | null
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
}

interface CanvasActions {
  actions: {
    onNodesChange: (changes: NodeChange<CanvasNode>[]) => void
    onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void
    createConnection: (connection: Connection, edgeData: CanvasEdgeData) => void
    addNode: (input: AddNodeInput) => void
    deleteSelectedNode: () => void
    selectNode: (nodeId: string | null) => void
    selectEdge: (edgeId: string | null) => void
    openFieldMapping: (edgeId: string) => void
    closeFieldMapping: () => void
    updateEdgeData: (edgeId: string, patch: Partial<CanvasEdgeData>) => void
    updateFieldMapping: (edgeId: string, mappings: FieldMapping[]) => void
    setViewport: (viewport: Viewport) => void
    commitViewport: (viewport: Viewport) => void
    applyServerSnapshot: (snapshot: CanvasSnapshot & { workflowId: string; version: number }) => void
    markSaved: (version: number) => void
    setIsSaving: (saving: boolean) => void
    reset: () => void
    toggleSearch: () => void
    setSearchQuery: (query: string) => void
    nextSearchResult: () => void
    prevSearchResult: () => void
    clearSearch: () => void
    toggleMiniMap: () => void
    setHoveredNodeId: (nodeId: string | null) => void
  }
}

function createInitialState(): CanvasState {
  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,
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
  }
}

function createEdgeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useCanvasStore = create<CanvasState & CanvasActions>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        ...createInitialState(),

        actions: {
          onNodesChange: (changes) =>
            set((state) => {
              state.nodes = applyNodeChanges(changes, state.nodes)
              const isDirtyChange = changes.some(
                (c) =>
                  c.type === 'remove' ||
                  c.type === 'add' ||
                  (c.type === 'position' && c.dragging === false)
              )
              if (isDirtyChange) {
                state.isDirty = true
              }
              const selectChange = changes.find((c) => c.type === 'select')
              if (selectChange && selectChange.type === 'select') {
                state.selectedNodeId = selectChange.selected ? selectChange.id : null
                if (selectChange.selected) state.selectedEdgeId = null
              }
            }),

          onEdgesChange: (changes) =>
            set((state) => {
              state.edges = applyEdgeChanges(changes, state.edges)
              const isDirtyChange = changes.some(
                (c) => c.type === 'remove' || c.type === 'add'
              )
              if (isDirtyChange) {
                state.isDirty = true
              }
              const removedIds = changes
                .filter((c): c is EdgeChange<CanvasEdge> & { type: 'remove' } => c.type === 'remove')
                .map((c) => c.id)
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
            }),

          addNode: (input) =>
            set((state) => {
              const config = getNodeTypeConfig(input.nodeType)
              const node: CanvasNode = {
                id: input.id,
                type: input.category,
                position: input.position,
                data: {
                  label: input.label ?? config.label,
                  nodeType: input.nodeType,
                  category: input.category,
                  description: input.description ?? config.description,
                  config: input.config ?? {},
                  inputPorts: clonePortDefinitions(config.inputPorts),
                  outputPorts: clonePortDefinitions(config.outputPorts),
                },
              }
              state.nodes.push(node)
              state.isDirty = true
            }),

          deleteSelectedNode: () =>
            set((state) => {
              if (!state.selectedNodeId) return
              const nodeId = state.selectedNodeId
              const removedEdgeIds = new Set(
                state.edges.filter((e) => e.source === nodeId || e.target === nodeId).map((e) => e.id)
              )
              state.nodes = state.nodes.filter((n) => n.id !== nodeId)
              state.edges = state.edges.filter(
                (e) => e.source !== nodeId && e.target !== nodeId
              )
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
              if (nodeId) state.selectedEdgeId = null
            }),

          selectEdge: (edgeId) =>
            set((state) => {
              state.selectedEdgeId = edgeId
              if (edgeId) state.selectedNodeId = null
            }),

          openFieldMapping: (edgeId) =>
            set((state) => {
              state.mappingPanelEdgeId = edgeId
              state.selectedEdgeId = edgeId
              state.selectedNodeId = null
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

          setViewport: (viewport) =>
            set((state) => {
              state.viewport = viewport
            }),

          commitViewport: (viewport) =>
            set((state) => {
              state.viewport = viewport
              state.isDirty = true
            }),

          applyServerSnapshot: ({ nodes, edges, viewport, workflowId, version }) =>
            set((state) => {
              state.nodes = nodes.map((n) => {
                const typeConfig = getNodeTypeConfigOrNull(n.data.nodeType)
                const inputPorts = Array.isArray(n.data.inputPorts)
                  ? clonePortDefinitions(n.data.inputPorts)
                  : typeConfig
                    ? clonePortDefinitions(typeConfig.inputPorts)
                    : []
                const outputPorts = Array.isArray(n.data.outputPorts)
                  ? clonePortDefinitions(n.data.outputPorts)
                  : typeConfig
                    ? clonePortDefinitions(typeConfig.outputPorts)
                    : []

                return {
                  ...n,
                  data: {
                    ...n.data,
                    config: n.data.config ?? {},
                    inputPorts,
                    outputPorts,
                  },
                }
              })
              state.edges = edges.map((e) => ({
                ...e,
                data: { ...createDefaultEdgeData(), ...(e.data ?? {}) },
              }))
              state.viewport = viewport ?? { x: 0, y: 0, zoom: 1 }
              state.workflowId = workflowId
              state.version = version
              state.isDirty = false
              state.selectedNodeId = null
              state.selectedEdgeId = null
              state.mappingPanelEdgeId = null
            }),

          markSaved: (version) =>
            set((state) => {
              state.isDirty = false
              state.lastSavedAt = new Date()
              state.isSaving = false
              state.version = version
            }),

          setIsSaving: (saving) =>
            set((state) => {
              state.isSaving = saving
            }),

          reset: () =>
            set((state) => {
              Object.assign(state, createInitialState())
            }),

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
              state.searchMatchIds = state.nodes
                .filter((n) => n.data.label.toLowerCase().includes(lowerQuery))
                .map((n) => n.id)
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
        },
      }))
    ),
    { name: 'CanvasStore' }
  )
)

export const useCanvasNodes = () => useCanvasStore((s) => s.nodes)

export const useCanvasEdges = () => useCanvasStore((s) => s.edges)

export const useCanvasActions = () => useCanvasStore((s) => s.actions)

export const useCanvasSaveStatus = () =>
  useCanvasStore(
    useShallow((s) => ({
      isDirty: s.isDirty,
      isSaving: s.isSaving,
      lastSavedAt: s.lastSavedAt,
    }))
  )

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
