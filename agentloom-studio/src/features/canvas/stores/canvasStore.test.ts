import { describe, expect, it, beforeEach } from 'vitest'
import type { AddNodeInput, CanvasEdge, CanvasNode } from '../types'
import { createDefaultEdgeData } from '../types'
import { clonePortDefinitions } from '../types/nodeTypeRegistry'
import { useCanvasStore } from './canvasStore'

const mockAddNodeInput: AddNodeInput = {
  id: 'node-1',
  nodeType: 'llm-agent',
  category: 'agent',
  position: { x: 100, y: 200 },
  label: 'Test Agent',
}

const customInputPorts = [
  {
    id: 'custom-input',
    label: 'Custom Input',
    direction: 'input' as const,
    dataType: 'text' as const,
    required: false,
    multiple: false,
    maxConnections: 1,
    schema: {
      kind: 'text' as const,
      title: 'Custom Input',
    },
  },
]

const customOutputPorts = [
  {
    id: 'custom-output',
    label: 'Custom Output',
    direction: 'output' as const,
    dataType: 'json' as const,
    required: false,
    multiple: false,
    maxConnections: 1,
    schema: {
      kind: 'json' as const,
      shape: 'object' as const,
      title: 'Custom Output',
      properties: {},
      additionalProperties: true,
    },
  },
]

function createNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'node-1',
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      label: 'Server Node',
      nodeType: 'llm-agent',
      category: 'agent',
      description: '来自服务端',
      config: {},
      inputPorts: [],
      outputPorts: [],
    },
    ...overrides,
  }
}

describe('canvasStore', () => {
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
  })

  it('injects registry defaults when adding nodes', () => {
    useCanvasStore.getState().actions.addNode(mockAddNodeInput)

    const state = useCanvasStore.getState()
    const node = state.nodes[0]

    if (!node) {
      throw new Error('Expected added node to exist')
    }

    expect(state.nodes).toHaveLength(1)
    expect(node.data.inputPorts).toHaveLength(2)
    expect(node.data.outputPorts).toHaveLength(2)
    expect(node.data.config).toEqual({})
    expect(state.isDirty).toBe(true)
  })

  it('deletes the selected node and its connected edges', () => {
    const node = createNode()
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [node],
      edges: [edge],
      selectedNodeId: 'node-1',
    }))

    useCanvasStore.getState().actions.deleteSelectedNode()

    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(0)
    expect(state.edges).toHaveLength(0)
    expect(state.selectedNodeId).toBeNull()
    expect(state.isDirty).toBe(true)
  })

  it('backfills missing ports and config during server snapshot hydration', () => {
    const partialNode = {
      ...createNode(),
      data: {
        label: 'Hydrated Node',
        nodeType: 'llm-agent',
        category: 'agent',
        description: 'Hydrated',
      },
    } as CanvasNode

    useCanvasStore.getState().actions.applyServerSnapshot({
      nodes: [partialNode],
      edges: [],
      workflowId: 'workflow-1',
      version: 7,
    })

    const state = useCanvasStore.getState()
    const hydratedNode = state.nodes[0]

    if (!hydratedNode) {
      throw new Error('Expected hydrated node to exist')
    }

    expect(hydratedNode.data.config).toEqual({})
    expect(hydratedNode.data.inputPorts).toHaveLength(2)
    expect(hydratedNode.data.outputPorts).toHaveLength(2)
    expect(state.isDirty).toBe(false)
    expect(state.selectedNodeId).toBeNull()
  })

  it('preserves existing ports and config during server snapshot hydration', () => {
    const snapshotNode = createNode({
      data: {
        label: 'Existing Ports',
        nodeType: 'llm-agent',
        category: 'agent',
        description: 'Keep my ports',
        config: { retries: 3 },
        inputPorts: clonePortDefinitions(customInputPorts),
        outputPorts: [],
      },
    })

    useCanvasStore.getState().actions.applyServerSnapshot({
      nodes: [snapshotNode],
      edges: [],
      workflowId: 'workflow-1',
      version: 8,
    })

    const hydratedNode = useCanvasStore.getState().nodes[0]

    if (!hydratedNode) {
      throw new Error('Expected hydrated node to exist')
    }

    expect(hydratedNode.data.config).toEqual({ retries: 3 })
    expect(hydratedNode.data.inputPorts).toEqual(customInputPorts)
    expect(hydratedNode.data.outputPorts).toEqual([])
  })

  it('updates save metadata when marking as saved', () => {
    const savedAt = Date.parse('2026-03-07T09:00:00.000Z')
    const before = Date.now()

    useCanvasStore.setState((state) => ({
      ...state,
      isDirty: true,
      isSaving: true,
    }))

    useCanvasStore.getState().actions.markSaved(savedAt)

    const state = useCanvasStore.getState()
    const lastSavedAt = state.lastSavedAt

    if (!lastSavedAt) {
      throw new Error('Expected lastSavedAt to be populated after marking the snapshot as saved')
    }

    expect(state.isDirty).toBe(false)
    expect(state.isSaving).toBe(false)
    expect(lastSavedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(lastSavedAt.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('tracks selection and viewport updates', () => {
    useCanvasStore.getState().actions.selectNode('node-42')
    useCanvasStore.getState().actions.setViewport({ x: 10, y: 20, zoom: 1.5 })
    useCanvasStore.getState().actions.commitViewport({ x: 30, y: 40, zoom: 2 })

    const state = useCanvasStore.getState()
    expect(state.selectedNodeId).toBe('node-42')
    expect(state.viewport).toEqual({ x: 30, y: 40, zoom: 2 })
    expect(state.isDirty).toBe(true)
  })

  it('marks node and edge changes as dirty', () => {
    const node = createNode({
      data: {
        label: 'Dirty Node',
        nodeType: 'llm-agent',
        category: 'agent',
        description: 'Dirty',
        config: {},
        inputPorts: clonePortDefinitions(customInputPorts),
        outputPorts: clonePortDefinitions(customOutputPorts),
      },
    })
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.setState((state) => ({
      ...state,
      nodes: [node],
      edges: [edge],
    }))

    useCanvasStore.getState().actions.onNodesChange([{ id: 'node-1', type: 'remove' }])
    useCanvasStore.getState().actions.onEdgesChange([{ id: 'edge-1', type: 'remove' }])

    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(0)
    expect(state.edges).toHaveLength(0)
    expect(state.isDirty).toBe(true)
  })

  it('tracks explicit saving state and reset behavior', () => {
    useCanvasStore.getState().actions.addNode(mockAddNodeInput)
    useCanvasStore.getState().actions.setIsSaving(true)

    expect(useCanvasStore.getState().isSaving).toBe(true)

    useCanvasStore.getState().actions.reset()

    const state = useCanvasStore.getState()
    expect(state.nodes).toEqual([])
    expect(state.edges).toEqual([])
    expect(state.selectedNodeId).toBeNull()
    expect(state.selectedEdgeId).toBeNull()
    expect(state.mappingPanelEdgeId).toBeNull()
    expect(state.isDirty).toBe(false)
    expect(state.isSaving).toBe(false)
    expect(state.workflowId).toBeNull()
    expect(state.version).toBe(1)
  })

  it('selects an edge and clears node selection', () => {
    useCanvasStore.getState().actions.selectNode('node-42')
    useCanvasStore.getState().actions.selectEdge('edge-1')

    const state = useCanvasStore.getState()
    expect(state.selectedEdgeId).toBe('edge-1')
    expect(state.selectedNodeId).toBeNull()
  })

  it('selects a node and clears edge selection', () => {
    useCanvasStore.getState().actions.selectEdge('edge-1')
    useCanvasStore.getState().actions.selectNode('node-42')

    const state = useCanvasStore.getState()
    expect(state.selectedNodeId).toBe('node-42')
    expect(state.selectedEdgeId).toBeNull()
  })

  it('opens field mapping panel for an edge', () => {
    useCanvasStore.getState().actions.selectNode('node-42')
    useCanvasStore.getState().actions.openFieldMapping('edge-1')

    const state = useCanvasStore.getState()
    expect(state.mappingPanelEdgeId).toBe('edge-1')
    expect(state.selectedEdgeId).toBe('edge-1')
    expect(state.selectedNodeId).toBeNull()
  })

  it('closes field mapping panel', () => {
    useCanvasStore.getState().actions.openFieldMapping('edge-1')
    useCanvasStore.getState().actions.closeFieldMapping()

    const state = useCanvasStore.getState()
    expect(state.mappingPanelEdgeId).toBeNull()
  })

  it('patches edge data and marks dirty', () => {
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.setState((s) => ({ ...s, edges: [edge] }))

    useCanvasStore.getState().actions.updateEdgeData('edge-1', {
      rawCompatibilityLevel: 'PARTIAL',
      visualLevel: 'L1',
    })

    const state = useCanvasStore.getState()
    const updatedEdge = state.edges[0]
    expect(updatedEdge?.data?.rawCompatibilityLevel).toBe('PARTIAL')
    expect(updatedEdge?.data?.visualLevel).toBe('L1')
    expect(updatedEdge?.data?.fieldMapping).toEqual([])
    expect(state.isDirty).toBe(true)
  })

  it('updates field mappings and recalculates summary', () => {
    const defaultData = createDefaultEdgeData()
    defaultData.missingFields = [
      { path: 'name', expectedType: { kind: 'text', title: 'name' }, required: true },
      { path: 'age', expectedType: { kind: 'json', shape: 'object', title: 'age', properties: {}, additionalProperties: false }, required: true },
    ]
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      data: defaultData,
    }

    useCanvasStore.setState((s) => ({ ...s, edges: [edge] }))

    useCanvasStore.getState().actions.updateFieldMapping('edge-1', [
      { sourceField: 'fullName', targetField: 'name', compatLevel: 'L0', autoRecommended: true, confidence: 0.95 },
    ])

    const state = useCanvasStore.getState()
    const updated = state.edges[0]?.data
    expect(updated?.fieldMapping).toHaveLength(1)
    expect(updated?.mappingSummary.autoMatchedCount).toBe(1)
    expect(updated?.mappingSummary.manualCount).toBe(0)
    expect(updated?.mappingSummary.requiredUnmappedCount).toBe(1)
    expect(state.isDirty).toBe(true)
  })

  it('hydrates edge data with defaults during server snapshot', () => {
    const bareEdge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.getState().actions.applyServerSnapshot({
      nodes: [],
      edges: [bareEdge],
      workflowId: 'wf-1',
      version: 1,
    })

    const state = useCanvasStore.getState()
    const hydratedEdge = state.edges[0]
    expect(hydratedEdge?.data).toBeDefined()
    expect(hydratedEdge?.data?.rawCompatibilityLevel).toBe('EXACT')
    expect(hydratedEdge?.data?.visualLevel).toBe('L0')
    expect(hydratedEdge?.data?.fieldMapping).toEqual([])
    expect(state.selectedEdgeId).toBeNull()
    expect(state.mappingPanelEdgeId).toBeNull()
  })

  it('clears edge state when deleting a node with connected edges', () => {
    const node = createNode()
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.setState((s) => ({
      ...s,
      nodes: [node],
      edges: [edge],
      selectedNodeId: 'node-1',
      selectedEdgeId: 'edge-1',
      mappingPanelEdgeId: 'edge-1',
    }))

    useCanvasStore.getState().actions.deleteSelectedNode()

    const state = useCanvasStore.getState()
    expect(state.selectedEdgeId).toBeNull()
    expect(state.mappingPanelEdgeId).toBeNull()
  })

  it('clears edge state when edge is removed via onEdgesChange', () => {
    const edge: CanvasEdge = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    }

    useCanvasStore.setState((s) => ({
      ...s,
      edges: [edge],
      selectedEdgeId: 'edge-1',
      mappingPanelEdgeId: 'edge-1',
    }))

    useCanvasStore.getState().actions.onEdgesChange([{ id: 'edge-1', type: 'remove' }])

    const state = useCanvasStore.getState()
    expect(state.edges).toHaveLength(0)
    expect(state.selectedEdgeId).toBeNull()
    expect(state.mappingPanelEdgeId).toBeNull()
  })

  it('creates smart connections once and ignores exact duplicates', () => {
    const sourceNode = createNode({
      id: 'src',
      data: {
        ...createNode().data,
        inputPorts: [],
        outputPorts: clonePortDefinitions(customOutputPorts),
      },
    })
    const targetNode = createNode({
      id: 'tgt',
      data: {
        ...createNode().data,
        inputPorts: clonePortDefinitions(customInputPorts),
        outputPorts: [],
      },
    })

    useCanvasStore.getState().actions.applyServerSnapshot({
      workflowId: 'workflow-1',
      nodes: [sourceNode, targetNode],
      edges: [],
      viewport: undefined,
      version: 1,
    })

    const edgeData = {
      ...createDefaultEdgeData(),
      rawCompatibilityLevel: 'PARTIAL' as const,
      visualLevel: 'L1' as const,
    }

    useCanvasStore.getState().actions.createConnection(
      {
        source: 'src',
        target: 'tgt',
        sourceHandle: 'result',
        targetHandle: 'input',
      },
      edgeData
    )
    useCanvasStore.getState().actions.createConnection(
      {
        source: 'src',
        target: 'tgt',
        sourceHandle: 'result',
        targetHandle: 'input',
      },
      edgeData
    )

    const state = useCanvasStore.getState()
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0]).toMatchObject({
      type: 'smart',
      source: 'src',
      target: 'tgt',
      sourceHandle: 'result',
      targetHandle: 'input',
      data: edgeData,
    })
    expect(state.isDirty).toBe(true)
  })

  describe('search actions', () => {
    it('toggleSearch opens and closes search', () => {
      useCanvasStore.getState().actions.toggleSearch()
      expect(useCanvasStore.getState().isSearchOpen).toBe(true)

      useCanvasStore.getState().actions.toggleSearch()
      expect(useCanvasStore.getState().isSearchOpen).toBe(false)
    })

    it('toggleSearch clears search state when closing', () => {
      useCanvasStore.getState().actions.toggleSearch()
      useCanvasStore.getState().actions.setSearchQuery('agent')
      useCanvasStore.getState().actions.toggleSearch()

      const state = useCanvasStore.getState()
      expect(state.searchQuery).toBe('')
      expect(state.searchMatchIds).toEqual([])
      expect(state.currentSearchIndex).toBe(-1)
    })

    it('setSearchQuery finds matching nodes by label', () => {
      const nodeA = createNode({ id: 'a', data: { ...createNode().data, label: 'LLM Agent' } })
      const nodeB = createNode({
        id: 'b',
        data: { ...createNode().data, label: 'HTTP Request', nodeType: 'http-tool' },
      })
      const nodeC = createNode({ id: 'c', data: { ...createNode().data, label: 'Data Agent' } })
      useCanvasStore.setState((s) => ({ ...s, nodes: [nodeA, nodeB, nodeC] }))

      useCanvasStore.getState().actions.setSearchQuery('agent')

      const state = useCanvasStore.getState()
      expect(state.searchMatchIds).toEqual(['a', 'c'])
      expect(state.currentSearchIndex).toBe(0)
    })

    it('setSearchQuery is case-insensitive', () => {
      const node = createNode({ id: 'x', data: { ...createNode().data, label: 'LLM Agent' } })
      useCanvasStore.setState((s) => ({ ...s, nodes: [node] }))

      useCanvasStore.getState().actions.setSearchQuery('llm')
      expect(useCanvasStore.getState().searchMatchIds).toEqual(['x'])
    })

    it('setSearchQuery also matches node type', () => {
      const node = createNode({
        id: 'http-node',
        data: {
          ...createNode().data,
          label: '请求节点',
          nodeType: 'http-tool',
        },
      })
      useCanvasStore.setState((s) => ({ ...s, nodes: [node] }))

      useCanvasStore.getState().actions.setSearchQuery('http')

      const state = useCanvasStore.getState()
      expect(state.searchMatchIds).toEqual(['http-node'])
      expect(state.currentSearchIndex).toBe(0)
    })

    it('setSearchQuery resets index when no matches', () => {
      const node = createNode()
      useCanvasStore.setState((s) => ({ ...s, nodes: [node] }))

      useCanvasStore.getState().actions.setSearchQuery('nonexistent')
      expect(useCanvasStore.getState().searchMatchIds).toEqual([])
      expect(useCanvasStore.getState().currentSearchIndex).toBe(-1)
    })

    it('setSearchQuery clears matches for empty/whitespace query', () => {
      const node = createNode()
      useCanvasStore.setState((s) => ({ ...s, nodes: [node] }))

      useCanvasStore.getState().actions.setSearchQuery('Server')
      expect(useCanvasStore.getState().searchMatchIds.length).toBeGreaterThan(0)

      useCanvasStore.getState().actions.setSearchQuery('  ')
      expect(useCanvasStore.getState().searchMatchIds).toEqual([])
      expect(useCanvasStore.getState().currentSearchIndex).toBe(-1)
    })

    it('nextSearchResult cycles forward through matches', () => {
      const nodes = [
        createNode({ id: 'a', data: { ...createNode().data, label: 'Agent 1' } }),
        createNode({ id: 'b', data: { ...createNode().data, label: 'Agent 2' } }),
        createNode({ id: 'c', data: { ...createNode().data, label: 'Agent 3' } }),
      ]
      useCanvasStore.setState((s) => ({ ...s, nodes }))
      useCanvasStore.getState().actions.setSearchQuery('Agent')

      expect(useCanvasStore.getState().currentSearchIndex).toBe(0)
      useCanvasStore.getState().actions.nextSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(1)
      useCanvasStore.getState().actions.nextSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(2)
      useCanvasStore.getState().actions.nextSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(0)
    })

    it('prevSearchResult cycles backward through matches', () => {
      const nodes = [
        createNode({ id: 'a', data: { ...createNode().data, label: 'Agent 1' } }),
        createNode({ id: 'b', data: { ...createNode().data, label: 'Agent 2' } }),
      ]
      useCanvasStore.setState((s) => ({ ...s, nodes }))
      useCanvasStore.getState().actions.setSearchQuery('Agent')

      expect(useCanvasStore.getState().currentSearchIndex).toBe(0)
      useCanvasStore.getState().actions.prevSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(1)
      useCanvasStore.getState().actions.prevSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(0)
    })

    it('next/prev does nothing when no matches', () => {
      useCanvasStore.getState().actions.nextSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(-1)
      useCanvasStore.getState().actions.prevSearchResult()
      expect(useCanvasStore.getState().currentSearchIndex).toBe(-1)
    })

    it('clearSearch resets all search state', () => {
      useCanvasStore.getState().actions.toggleSearch()
      useCanvasStore.getState().actions.setSearchQuery('test')
      useCanvasStore.getState().actions.clearSearch()

      const state = useCanvasStore.getState()
      expect(state.isSearchOpen).toBe(false)
      expect(state.searchQuery).toBe('')
      expect(state.searchMatchIds).toEqual([])
      expect(state.currentSearchIndex).toBe(-1)
    })
  })

  describe('minimap actions', () => {
    it('toggleMiniMap toggles collapsed state', () => {
      expect(useCanvasStore.getState().isMiniMapCollapsed).toBe(false)

      useCanvasStore.getState().actions.toggleMiniMap()
      expect(useCanvasStore.getState().isMiniMapCollapsed).toBe(true)

      useCanvasStore.getState().actions.toggleMiniMap()
      expect(useCanvasStore.getState().isMiniMapCollapsed).toBe(false)
    })
  })

  describe('hover actions', () => {
    it('setHoveredNodeId sets and clears hover', () => {
      useCanvasStore.getState().actions.setHoveredNodeId('node-1')
      expect(useCanvasStore.getState().hoveredNodeId).toBe('node-1')

      useCanvasStore.getState().actions.setHoveredNodeId(null)
      expect(useCanvasStore.getState().hoveredNodeId).toBeNull()
    })
  })

  it('reset clears search, minimap, and hover state', () => {
    useCanvasStore.getState().actions.toggleSearch()
    useCanvasStore.getState().actions.setSearchQuery('test')
    useCanvasStore.getState().actions.toggleMiniMap()
    useCanvasStore.getState().actions.setHoveredNodeId('node-1')

    useCanvasStore.getState().actions.reset()

    const state = useCanvasStore.getState()
    expect(state.isSearchOpen).toBe(false)
    expect(state.searchQuery).toBe('')
    expect(state.searchMatchIds).toEqual([])
    expect(state.currentSearchIndex).toBe(-1)
    expect(state.isMiniMapCollapsed).toBe(false)
    expect(state.hoveredNodeId).toBeNull()
  })
})
