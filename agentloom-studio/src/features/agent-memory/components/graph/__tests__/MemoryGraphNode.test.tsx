import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryGraphNode } from '../MemoryGraphNode'
import type { MemoryGraphNodeData } from '../types'

// ReactFlow Handle 组件需要 mock，因为 jsdom 没有 SVG 布局
vi.mock('@xyflow/react', () => ({
  Handle: ({ type }: { type: string }) => (
    <div data-testid={`handle-${type}`} />
  ),
  Position: { Top: 'top', Bottom: 'bottom' },
}))

function makeNodeData(
  overrides: Partial<MemoryGraphNodeData> = {},
): MemoryGraphNodeData {
  return {
    nodeId: 'node-1',
    name: '测试节点',
    nodeType: 'concept',
    domain: 'test-domain',
    contentSnippet: '这是一段测试内容摘要...',
    disclosureLevel: 'internal',
    isHighlighted: false,
    isDimmed: false,
    ...overrides,
  }
}

describe('MemoryGraphNode', () => {
  const baseProps = {
    selected: false,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 1,
    draggable: false,
    dragging: false,
    selectable: false,
    deletable: false,
  } as const

  it('渲染节点名称和内容摘要', () => {
    render(
      <MemoryGraphNode
        id="node-1"
        type="memoryGraphNode"
        data={makeNodeData()}
        {...baseProps}
      />,
    )
    expect(screen.getByText('测试节点')).toBeInTheDocument()
    expect(screen.getByText('这是一段测试内容摘要...')).toBeInTheDocument()
  })

  it('渲染节点类型和域标签', () => {
    render(
      <MemoryGraphNode
        id="node-1"
        type="memoryGraphNode"
        data={makeNodeData()}
        {...baseProps}
      />,
    )
    expect(screen.getByText('concept · test-domain')).toBeInTheDocument()
  })

  it('渲染披露等级徽章', () => {
    render(
      <MemoryGraphNode
        id="node-1"
        type="memoryGraphNode"
        data={makeNodeData({ disclosureLevel: 'confidential' })}
        {...baseProps}
      />,
    )
    const badge = screen.getByTestId('disclosure-badge')
    expect(badge).toHaveTextContent('confidential')
  })

  it('没有 disclosureLevel 时不渲染徽章', () => {
    render(
      <MemoryGraphNode
        id="node-1"
        type="memoryGraphNode"
        data={makeNodeData({ disclosureLevel: null })}
        {...baseProps}
      />,
    )
    expect(screen.queryByTestId('disclosure-badge')).not.toBeInTheDocument()
  })

  it('高亮状态使用 warning 令牌描边', () => {
    render(
      <MemoryGraphNode
        id="node-1"
        type="memoryGraphNode"
        data={makeNodeData({ isHighlighted: true })}
        {...baseProps}
      />,
    )
    const el = screen.getByTestId('memory-graph-node-node-1')
    expect(el.className).toContain('ring-warning')
    expect(el).toHaveAttribute('data-highlighted', 'true')
  })

  it('淡化状态降低透明度', () => {
    render(
      <MemoryGraphNode
        id="node-1"
        type="memoryGraphNode"
        data={makeNodeData({ isDimmed: true })}
        {...baseProps}
      />,
    )
    const el = screen.getByTestId('memory-graph-node-node-1')
    expect(el.className).toContain('opacity-30')
  })

  it('渲染上下两个 Handle', () => {
    render(
      <MemoryGraphNode
        id="node-1"
        type="memoryGraphNode"
        data={makeNodeData()}
        {...baseProps}
      />,
    )
    expect(screen.getByTestId('handle-target')).toBeInTheDocument()
    expect(screen.getByTestId('handle-source')).toBeInTheDocument()
  })
})
