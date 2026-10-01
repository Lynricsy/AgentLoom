import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultEdgeData } from '../types'
import { useCanvasStore } from './canvasStore'

const history = () => useCanvasStore.temporal.getState()
const actions = () => useCanvasStore.getState().actions

function addTextPair() {
  actions().addNode({
    id: 'text-1',
    nodeType: 'text',
    category: 'output',
    position: { x: 0, y: 0 },
    label: 'Text',
  })
  actions().addNode({
    id: 'output-1',
    nodeType: 'text-output',
    category: 'output',
    position: { x: 300, y: 0 },
    label: 'Text Output',
  })
}

function connectTextPair() {
  actions().createConnection(
    {
      source: 'text-1',
      target: 'output-1',
      sourceHandle: 'text-out',
      targetHandle: 'content-in',
    },
    createDefaultEdgeData(),
  )
}

function nodeIds() {
  return useCanvasStore.getState().nodes.map((node) => node.id)
}

describe('canvasStore 撤销/重做历史', () => {
  beforeEach(() => {
    actions().reset()
  })

  it('增删节点与连线后可以逐步撤销和重做', () => {
    addTextPair()
    connectTextPair()
    expect(useCanvasStore.getState().edges).toHaveLength(1)

    actions().undo()
    expect(useCanvasStore.getState().edges).toHaveLength(0)
    expect(nodeIds()).toEqual(['text-1', 'output-1'])

    actions().undo()
    expect(nodeIds()).toEqual(['text-1'])

    actions().redo()
    actions().redo()
    expect(nodeIds()).toEqual(['text-1', 'output-1'])
    expect(useCanvasStore.getState().edges).toHaveLength(1)

    actions().onNodesChange([{ id: 'output-1', type: 'remove' }])
    actions().onEdgesChange([
      { id: useCanvasStore.getState().edges[0]!.id, type: 'remove' },
    ])
    expect(nodeIds()).toEqual(['text-1'])

    actions().undo()
    actions().undo()
    expect(nodeIds()).toEqual(['text-1', 'output-1'])
    expect(useCanvasStore.getState().edges).toHaveLength(1)
  })

  it('撤销后标记 dirty 以触发自动保存，并清空选中态', () => {
    addTextPair()
    actions().markSaved(2)
    actions().selectNode('output-1')

    actions().undo()

    const state = useCanvasStore.getState()
    expect(nodeIds()).toEqual(['text-1'])
    expect(state.isDirty).toBe(true)
    expect(state.selectedNodeId).toBeNull()
    expect(state.selectedNodeIds.size).toBe(0)
  })

  it('选中、保存状态与尺寸测量不产生历史', () => {
    addTextPair()
    const stepsBefore = history().pastStates.length

    actions().onNodesChange([
      { id: 'text-1', type: 'select', selected: true },
    ])
    actions().setIsSaving(true)
    actions().markSaved(3)
    actions().onNodesChange([
      {
        id: 'text-1',
        type: 'dimensions',
        dimensions: { width: 200, height: 80 },
      },
    ])

    expect(history().pastStates).toHaveLength(stepsBefore)
  })

  it('一次拖拽只产生一步历史，撤销回到拖拽前的位置', () => {
    addTextPair()
    const stepsBefore = history().pastStates.length

    for (const x of [10, 40, 90]) {
      actions().onNodesChange([
        { id: 'text-1', type: 'position', position: { x, y: 5 }, dragging: true },
      ])
    }
    actions().onNodesChange([
      { id: 'text-1', type: 'position', position: { x: 120, y: 5 }, dragging: false },
    ])

    expect(history().pastStates).toHaveLength(stepsBefore + 1)
    expect(useCanvasStore.getState().nodes[0]?.position).toEqual({ x: 120, y: 5 })

    actions().undo()
    expect(useCanvasStore.getState().nodes[0]?.position).toEqual({ x: 0, y: 0 })
    expect(useCanvasStore.getState().nodes[0]?.dragging).toBeUndefined()

    actions().redo()
    expect(useCanvasStore.getState().nodes[0]?.position).toEqual({ x: 120, y: 5 })
  })

  it('加载工作流后历史为空', () => {
    addTextPair()
    actions().undo()
    expect(history().pastStates.length + history().futureStates.length).toBeGreaterThan(0)

    actions().applyServerSnapshot({
      workflowId: 'workflow-1',
      nodes: [],
      edges: [],
      viewport: undefined,
      version: 4,
    })

    expect(history().pastStates).toHaveLength(0)
    expect(history().futureStates).toHaveLength(0)

    actions().undo()
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    expect(useCanvasStore.getState().isDirty).toBe(false)
  })
})
