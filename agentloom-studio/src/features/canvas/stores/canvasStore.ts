import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Viewport,
} from '@xyflow/react'
import type { CanvasNode, CanvasEdge, CanvasSnapshot } from '../types'

interface CanvasState {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport
  selectedNodeId: string | null
  isDirty: boolean
  lastSavedAt: Date | null
  isSaving: boolean
  workflowId: string | null
  version: number
}

interface CanvasActions {
  actions: {
    onNodesChange: (changes: NodeChange<CanvasNode>[]) => void
    onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void
    addNode: (node: CanvasNode) => void
    deleteSelectedNode: () => void
    selectNode: (nodeId: string | null) => void
    setViewport: (viewport: Viewport) => void
    applyServerSnapshot: (snapshot: CanvasSnapshot & { workflowId: string; version: number }) => void
    markSaved: (version: number) => void
    setIsSaving: (saving: boolean) => void
    reset: () => void
  }
}

const initialState: CanvasState = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeId: null,
  isDirty: false,
  lastSavedAt: null,
  isSaving: false,
  workflowId: null,
  version: 1,
}

export const useCanvasStore = create<CanvasState & CanvasActions>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        ...initialState,

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
            }),

          addNode: (node) =>
            set((state) => {
              state.nodes.push(node)
              state.isDirty = true
            }),

          deleteSelectedNode: () =>
            set((state) => {
              if (!state.selectedNodeId) return
              const nodeId = state.selectedNodeId
              state.nodes = state.nodes.filter((n) => n.id !== nodeId)
              state.edges = state.edges.filter(
                (e) => e.source !== nodeId && e.target !== nodeId
              )
              state.selectedNodeId = null
              state.isDirty = true
            }),

          selectNode: (nodeId) =>
            set((state) => {
              state.selectedNodeId = nodeId
            }),

          setViewport: (viewport) =>
            set((state) => {
              state.viewport = viewport
            }),

          applyServerSnapshot: ({ nodes, edges, viewport, workflowId, version }) =>
            set((state) => {
              state.nodes = nodes
              state.edges = edges
              state.viewport = viewport ?? { x: 0, y: 0, zoom: 1 }
              state.workflowId = workflowId
              state.version = version
              state.isDirty = false
              state.selectedNodeId = null
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

          reset: () => set(() => ({ ...initialState, actions: undefined as never })),
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
  useCanvasStore((s) => ({
    isDirty: s.isDirty,
    isSaving: s.isSaving,
    lastSavedAt: s.lastSavedAt,
  }))
