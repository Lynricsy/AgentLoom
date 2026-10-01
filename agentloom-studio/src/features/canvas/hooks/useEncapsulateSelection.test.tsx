import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../stores/canvasStore'
import type { CanvasEdge, CanvasNode } from '../types'
import { createDefaultEdgeData } from '../types'
import { getNodeTypeConfig } from '../types/nodeTypeRegistry'
import { clonePortDefinitions } from '../types/portSchema'
import { useEncapsulateSelection } from './useEncapsulateSelection'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/features/block-library', () => ({
  useCreateBlock: () => ({ mutate: mocks.mutate }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

function node(id: string, nodeType: 'text' | 'input-preprocessor' | 'text-output', extra: Partial<CanvasNode> = {}): CanvasNode {
  const config = getNodeTypeConfig(nodeType)
  return {
    id,
    type: config.category,
    position: { x: 100, y: 100 },
    data: {
      label: config.label,
      nodeType,
      category: config.category,
      config: {},
      inputPorts: clonePortDefinitions(config.inputPorts),
      outputPorts: clonePortDefinitions(config.outputPorts),
    },
    ...extra,
  }
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): CanvasEdge {
  return { id, source, sourceHandle, target, targetHandle, data: createDefaultEdgeData() }
}

/** src(Text) → pre1 → pre2 → out(Text Output)，封装 pre1 + pre2 */
function seedCanvas() {
  useCanvasStore.setState({
    nodes: [
      node('src', 'text'),
      node('pre1', 'input-preprocessor', { position: { x: 200, y: 0 } }),
      node('pre2', 'input-preprocessor', { position: { x: 400, y: 200 } }),
      node('out', 'text-output'),
    ],
    edges: [
      edge('e1', 'src', 'text-out', 'pre1', 'text-in'),
      edge('e2', 'pre1', 'text-out', 'pre2', 'text-in'),
      edge('e3', 'pre2', 'text-out', 'out', 'content-in'),
    ],
    selectedNodeIds: new Set(['pre1', 'pre2']),
    selectedNodeId: null,
    isDirty: false,
  })
}

describe('useEncapsulateSelection（「封装为可复用块」流程）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCanvasStore.getState().actions.reset()
  })

  it('打开时按选区派生块端口；确认后保存到 My Blocks 并在画布上用块节点替换选区', () => {
    seedCanvas()
    const { result } = renderHook(() => useEncapsulateSelection())

    act(() => result.current.openEncapsulation())

    const analysis = result.current.analysis
    expect(analysis?.selectedNodes.map((n) => n.id)).toEqual(['pre1', 'pre2'])
    expect(analysis?.inputPorts).toMatchObject([{ sourceNodeId: 'pre1', sourcePortId: 'text-in', dataType: 'text' }])
    expect(analysis?.outputPorts).toMatchObject([{ sourceNodeId: 'pre2', sourcePortId: 'text-out', dataType: 'text' }])

    act(() =>
      result.current.onConfirm({
        name: '清洗块',
        description: '',
        category: 'content',
        tags: ['etl'],
        inputPorts: analysis!.inputPorts.map((p) => ({ ...p, label: '原文' })),
        outputPorts: analysis!.outputPorts,
      }),
    )

    expect(mocks.mutate).toHaveBeenCalledTimes(1)
    const [body, callbacks] = mocks.mutate.mock.calls[0]!
    expect(body).toMatchObject({
      name: '清洗块',
      category: 'content',
      tags: ['etl'],
      metadata: { nodeCount: 2, version: 1 },
      definition: {
        nodes: [expect.objectContaining({ id: 'pre1' }), expect.objectContaining({ id: 'pre2' })],
        edges: [expect.objectContaining({ id: 'e2' })],
        inputPorts: [expect.objectContaining({ label: '原文', sourceNodeId: 'pre1', sourcePortId: 'text-in' })],
        outputPorts: [expect.objectContaining({ sourceNodeId: 'pre2', sourcePortId: 'text-out' })],
      },
    })
    // 保存成功前画布不变
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(['src', 'pre1', 'pre2', 'out'])

    act(() => callbacks.onSuccess({ id: 'block-def-1', name: '清洗块' }))

    const state = useCanvasStore.getState()
    const block = state.nodes.find((n) => n.data.nodeType === 'reusable-block')
    expect(state.nodes.map((n) => n.id)).toEqual(['src', 'out', block?.id])
    expect(block?.data).toMatchObject({
      blockId: 'block-def-1',
      blockName: '清洗块',
      blockDefinition: { inputPorts: [expect.objectContaining({ label: '原文' })] },
    })
    const [blockIn] = block!.data.inputPorts
    const [blockOut] = block!.data.outputPorts
    expect(state.edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle])).toEqual([
      ['src', 'text-out', block!.id, blockIn!.id],
      [block!.id, blockOut!.id, 'out', 'content-in'],
    ])
    expect(state.selectedNodeIds).toEqual(new Set([block!.id]))
    expect(state.isDirty).toBe(true)
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
  })

  it('保存失败时画布保持原样并提示错误', () => {
    seedCanvas()
    const { result } = renderHook(() => useEncapsulateSelection())
    act(() => result.current.openEncapsulation())
    const analysis = result.current.analysis!

    act(() =>
      result.current.onConfirm({
        name: '块',
        description: '',
        category: 'analysis',
        tags: [],
        inputPorts: analysis.inputPorts,
        outputPorts: analysis.outputPorts,
      }),
    )
    act(() => mocks.mutate.mock.calls[0]![1].onError(new Error('422')))

    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(['src', 'pre1', 'pre2', 'out'])
    expect(mocks.notify).toHaveBeenCalledWith({ variant: 'error', description: '封装失败：422' })
  })

  it('选区不足两个节点或跨层级时不打开对话框', () => {
    seedCanvas()
    useCanvasStore.setState({ selectedNodeIds: new Set(['pre1']) })
    const { result } = renderHook(() => useEncapsulateSelection())

    act(() => result.current.openEncapsulation())

    expect(result.current.analysis).toBeNull()
    expect(mocks.notify).toHaveBeenCalledWith({
      variant: 'error',
      description: '至少选择两个节点才能封装为可复用块',
    })

    useCanvasStore.setState((state) => ({
      nodes: state.nodes.map((n) => (n.id === 'pre2' ? { ...n, parentId: 'src' } : n)),
      selectedNodeIds: new Set(['pre1', 'pre2']),
    }))
    act(() => result.current.openEncapsulation())

    expect(result.current.analysis).toBeNull()
    expect(mocks.notify).toHaveBeenLastCalledWith({
      variant: 'error',
      description: '只能封装同一层级的节点（同为顶层或同一个容器内）',
    })
  })
})
