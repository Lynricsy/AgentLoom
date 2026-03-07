import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from './canvasStore'
import type { AddNodeInput, CanvasNode, CanvasEdge } from '../types'

const mockAddNodeInput: AddNodeInput = {
  id: 'node-1',
  nodeType: 'llm-agent',
  category: 'agent',
  position: { x: 100, y: 200 },
  label: 'Test Agent',
}

const mockNode: CanvasNode = {
  id: 'node-1',
  type: 'agent',
  position: { x: 100, y: 200 },
  data: {
    label: 'Test Agent',
    nodeType: 'llm-agent',
    category: 'agent',
    config: {},
    inputPorts: [],
    outputPorts: [],
  },
}

const mockEdge: CanvasEdge = {
  id: 'edge-1',
  source: 'node-1',
  target: 'node-2',
}

describe('canvasStore', () => {
  beforeEach(() => {
    // 重置 store 状态
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeId: null,
      isDirty: false,
      lastSavedAt: null,
      isSaving: false,
      workflowId: null,
      version: 1,
    })
  })

  describe('addNode', () => {
    it('应该通过 AddNodeInput 添加节点并自动注入端口', () => {
      const { actions } = useCanvasStore.getState()
      actions.addNode(mockAddNodeInput)

      const state = useCanvasStore.getState()
      expect(state.nodes).toHaveLength(1)
      expect(state.nodes[0]!.id).toBe('node-1')
      expect(state.nodes[0]!.type).toBe('agent')
      expect(state.nodes[0]!.data.nodeType).toBe('llm-agent')
      expect(state.nodes[0]!.data.inputPorts.length).toBeGreaterThan(0)
      expect(state.nodes[0]!.data.outputPorts.length).toBeGreaterThan(0)
      expect(state.nodes[0]!.data.config).toEqual({})
      expect(state.isDirty).toBe(true)
    })
  })

  describe('deleteSelectedNode', () => {
    it('应该删除选中节点及其关联边', () => {
      const node2: CanvasNode = {
        id: 'node-2',
        type: 'tool',
        position: { x: 300, y: 200 },
        data: {
          label: 'Test Tool',
          nodeType: 'http-tool',
          category: 'tool',
          config: {},
          inputPorts: [],
          outputPorts: [],
        },
      }

      useCanvasStore.setState({
        nodes: [mockNode, node2],
        edges: [mockEdge],
        selectedNodeId: 'node-1',
      })

      const { actions } = useCanvasStore.getState()
      actions.deleteSelectedNode()

      const state = useCanvasStore.getState()
      expect(state.nodes).toHaveLength(1)
      expect(state.nodes[0]!.id).toBe('node-2')
      expect(state.edges).toHaveLength(0)
      expect(state.selectedNodeId).toBeNull()
      expect(state.isDirty).toBe(true)
    })

    it('当无选中节点时不做任何操作', () => {
      useCanvasStore.setState({
        nodes: [mockNode],
        edges: [],
        selectedNodeId: null,
        isDirty: false,
      })

      const { actions } = useCanvasStore.getState()
      actions.deleteSelectedNode()

      const state = useCanvasStore.getState()
      expect(state.nodes).toHaveLength(1)
      expect(state.isDirty).toBe(false)
    })
  })

  describe('applyServerSnapshot', () => {
    it('应该加载服务端数据并重置 dirty 状态', () => {
      useCanvasStore.setState({ isDirty: true, selectedNodeId: 'old-node' })

      const { actions } = useCanvasStore.getState()
      actions.applyServerSnapshot({
        nodes: [mockNode],
        edges: [mockEdge],
        viewport: { x: 10, y: 20, zoom: 1.5 },
        workflowId: 'wf-001',
        version: 3,
      })

      const state = useCanvasStore.getState()
      expect(state.nodes).toHaveLength(1)
      expect(state.nodes[0]!.data.inputPorts.length).toBeGreaterThan(0)
      expect(state.nodes[0]!.data.outputPorts.length).toBeGreaterThan(0)
      expect(state.edges).toHaveLength(1)
      expect(state.viewport).toEqual({ x: 10, y: 20, zoom: 1.5 })
      expect(state.workflowId).toBe('wf-001')
      expect(state.version).toBe(3)
      expect(state.isDirty).toBe(false)
      expect(state.selectedNodeId).toBeNull()
    })
  })

  describe('markSaved', () => {
    it('应该更新保存状态和版本号', () => {
      useCanvasStore.setState({ isDirty: true, isSaving: true, version: 1 })

      const { actions } = useCanvasStore.getState()
      actions.markSaved(2)

      const state = useCanvasStore.getState()
      expect(state.isDirty).toBe(false)
      expect(state.isSaving).toBe(false)
      expect(state.version).toBe(2)
      expect(state.lastSavedAt).toBeInstanceOf(Date)
    })
  })

  describe('selectNode', () => {
    it('应该更新 selectedNodeId', () => {
      const { actions } = useCanvasStore.getState()
      actions.selectNode('node-1')

      expect(useCanvasStore.getState().selectedNodeId).toBe('node-1')

      actions.selectNode(null)
      expect(useCanvasStore.getState().selectedNodeId).toBeNull()
    })
  })

  describe('onNodesChange', () => {
    it('当 position 变化且 dragging=false 时应标记 isDirty', () => {
      useCanvasStore.setState({ nodes: [mockNode], isDirty: false })

      const { actions } = useCanvasStore.getState()
      actions.onNodesChange([
        { type: 'position', id: 'node-1', position: { x: 200, y: 300 }, dragging: false },
      ])

      const state = useCanvasStore.getState()
      expect(state.isDirty).toBe(true)
    })

    it('当 position 变化且 dragging=true 时不标记 isDirty', () => {
      useCanvasStore.setState({ nodes: [mockNode], isDirty: false })

      const { actions } = useCanvasStore.getState()
      actions.onNodesChange([
        { type: 'position', id: 'node-1', position: { x: 200, y: 300 }, dragging: true },
      ])

      const state = useCanvasStore.getState()
      expect(state.isDirty).toBe(false)
    })

    it('当 select 变化时应更新 selectedNodeId', () => {
      useCanvasStore.setState({ nodes: [mockNode], selectedNodeId: null })

      const { actions } = useCanvasStore.getState()
      actions.onNodesChange([
        { type: 'select', id: 'node-1', selected: true },
      ])

      expect(useCanvasStore.getState().selectedNodeId).toBe('node-1')

      actions.onNodesChange([
        { type: 'select', id: 'node-1', selected: false },
      ])

      expect(useCanvasStore.getState().selectedNodeId).toBeNull()
    })

    it('当 remove 变化时应标记 isDirty', () => {
      useCanvasStore.setState({ nodes: [mockNode], isDirty: false })

      const { actions } = useCanvasStore.getState()
      actions.onNodesChange([{ type: 'remove', id: 'node-1' }])

      const state = useCanvasStore.getState()
      expect(state.isDirty).toBe(true)
    })
  })

  describe('onEdgesChange', () => {
    it('当 remove 变化时应标记 isDirty', () => {
      useCanvasStore.setState({ edges: [mockEdge], isDirty: false })

      const { actions } = useCanvasStore.getState()
      actions.onEdgesChange([{ type: 'remove', id: 'edge-1' }])

      const state = useCanvasStore.getState()
      expect(state.isDirty).toBe(true)
      expect(state.edges).toHaveLength(0)
    })
  })

  describe('setViewport', () => {
    it('应该更新 viewport', () => {
      const { actions } = useCanvasStore.getState()
      actions.setViewport({ x: 50, y: 100, zoom: 2 })

      const state = useCanvasStore.getState()
      expect(state.viewport).toEqual({ x: 50, y: 100, zoom: 2 })
      expect(state.isDirty).toBe(false)
    })
  })

  describe('commitViewport', () => {
    it('应该在视口交互结束后更新 viewport 并标记 isDirty', () => {
      const { actions } = useCanvasStore.getState()
      actions.commitViewport({ x: 50, y: 100, zoom: 2 })

      const state = useCanvasStore.getState()
      expect(state.viewport).toEqual({ x: 50, y: 100, zoom: 2 })
      expect(state.isDirty).toBe(true)
    })
  })

  describe('setIsSaving', () => {
    it('应该更新 isSaving 状态', () => {
      const { actions } = useCanvasStore.getState()
      actions.setIsSaving(true)

      expect(useCanvasStore.getState().isSaving).toBe(true)

      actions.setIsSaving(false)
      expect(useCanvasStore.getState().isSaving).toBe(false)
    })
  })

  describe('reset', () => {
    it('应该重置为初始状态', () => {
      useCanvasStore.setState({
        nodes: [mockNode],
        edges: [mockEdge],
        viewport: { x: 50, y: 100, zoom: 2 },
        selectedNodeId: 'node-1',
        isDirty: true,
        isSaving: true,
        workflowId: 'wf-001',
        version: 5,
      })

      const { actions } = useCanvasStore.getState()
      actions.reset()

      const state = useCanvasStore.getState()
      expect(state.nodes).toHaveLength(0)
      expect(state.edges).toHaveLength(0)
      expect(state.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
      expect(state.selectedNodeId).toBeNull()
      expect(state.isDirty).toBe(false)
      expect(state.isSaving).toBe(false)
      expect(state.workflowId).toBeNull()
      expect(state.version).toBe(1)

      state.actions.addNode(mockAddNodeInput)
      expect(useCanvasStore.getState().nodes).toHaveLength(1)
    })
  })
})
