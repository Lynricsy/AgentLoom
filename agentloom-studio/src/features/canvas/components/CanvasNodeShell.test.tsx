import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CanvasNodeShell } from './CanvasNodeShell'
import { getNodeTypeConfig, clonePortDefinitions } from '../nodeTypeRegistry'
import type { CanvasNodeData } from '../types'

vi.mock('@xyflow/react', () => ({
  Handle: (props: Record<string, unknown>) => (
    <div
      data-testid={props['data-testid'] as string}
      data-port-type={props['data-port-type'] as string}
      data-port-state={props['data-port-state'] as string}
      aria-label={props['aria-label'] as string}
      className={props.className as string}
    />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useNodeConnections: vi.fn(() => []),
}))

function createMockNodeData(nodeType: string = 'llm-agent'): CanvasNodeData {
  const config = getNodeTypeConfig(nodeType as never)
  return {
    label: config.label,
    nodeType: config.type,
    category: config.category,
    description: config.description,
    config: {},
    inputPorts: clonePortDefinitions(config.inputPorts),
    outputPorts: clonePortDefinitions(config.outputPorts),
  }
}

describe('CanvasNodeShell', () => {
  it('应该渲染节点并显示 data-testid', () => {
    const data = createMockNodeData('llm-agent')
    render(
      <CanvasNodeShell
        id="node-1"
        data={data}
        selected={false}
        isConnectable={true}
        type="agent"
        dragging={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    expect(screen.getByTestId('canvas-node-node-1')).toBeInTheDocument()
  })

  it('应该渲染节点标签', () => {
    const data = createMockNodeData('llm-agent')
    render(
      <CanvasNodeShell
        id="node-1"
        data={data}
        selected={false}
        isConnectable={true}
        type="agent"
        dragging={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    expect(screen.getByText('LLM Agent')).toBeInTheDocument()
  })

  it('应该渲染节点描述', () => {
    const data = createMockNodeData('llm-agent')
    render(
      <CanvasNodeShell
        id="node-1"
        data={data}
        selected={false}
        isConnectable={true}
        type="agent"
        dragging={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    expect(screen.getByText(data.description!)).toBeInTheDocument()
  })

  it('当选中时应有 ring 样式', () => {
    const data = createMockNodeData('llm-agent')
    render(
      <CanvasNodeShell
        id="node-1"
        data={data}
        selected={true}
        isConnectable={true}
        type="agent"
        dragging={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    const article = screen.getByTestId('canvas-node-node-1')
    expect(article.className).toContain('ring-2')
    expect(article.className).toContain('ring-primary')
  })

  it('未选中时不应有 ring 样式', () => {
    const data = createMockNodeData('llm-agent')
    render(
      <CanvasNodeShell
        id="node-1"
        data={data}
        selected={false}
        isConnectable={true}
        type="agent"
        dragging={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    const article = screen.getByTestId('canvas-node-node-1')
    expect(article.className).not.toContain('ring-2')
  })

  it('应该渲染输入端口', () => {
    const data = createMockNodeData('llm-agent')
    render(
      <CanvasNodeShell
        id="node-1"
        data={data}
        selected={false}
        isConnectable={true}
        type="agent"
        dragging={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    for (const port of data.inputPorts) {
      expect(
        screen.getByTestId(`port-node-1-${port.id}-input`),
      ).toBeInTheDocument()
      expect(screen.getByText(port.label)).toBeInTheDocument()
    }
  })

  it('应该渲染输出端口', () => {
    const data = createMockNodeData('llm-agent')
    render(
      <CanvasNodeShell
        id="node-1"
        data={data}
        selected={false}
        isConnectable={true}
        type="agent"
        dragging={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    for (const port of data.outputPorts) {
      expect(
        screen.getByTestId(`port-node-1-${port.id}-output`),
      ).toBeInTheDocument()
      expect(screen.getByText(port.label)).toBeInTheDocument()
    }
  })

  it('无描述时应回退到分类标签', () => {
    const data = createMockNodeData('llm-agent')
    data.description = undefined
    render(
      <CanvasNodeShell
        id="node-1"
        data={data}
        selected={false}
        isConnectable={true}
        type="agent"
        dragging={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    expect(screen.getByText('Agent')).toBeInTheDocument()
  })

  it('应该渲染 header / inputs / body / outputs / state 插槽', () => {
    const data = createMockNodeData('llm-agent')
    render(
      <CanvasNodeShell
        id="node-1"
        data={data}
        selected={false}
        isConnectable={true}
        type="agent"
        dragging={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    const article = screen.getByTestId('canvas-node-node-1')
    expect(article.querySelector('[data-slot="header"]')).toBeTruthy()
    expect(article.querySelector('[data-slot="inputs"]')).toBeTruthy()
    expect(article.querySelector('[data-slot="body"]')).toBeTruthy()
    expect(article.querySelector('[data-slot="outputs"]')).toBeTruthy()
    expect(article.querySelector('[data-slot="state"]')).toBeTruthy()
  })

  it('无端口时不应渲染 inputs/outputs 插槽', () => {
    const data = createMockNodeData('llm-agent')
    data.inputPorts = []
    data.outputPorts = []
    render(
      <CanvasNodeShell
        id="node-1"
        data={data}
        selected={false}
        isConnectable={true}
        type="agent"
        dragging={false}
        zIndex={0}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    const article = screen.getByTestId('canvas-node-node-1')
    expect(article.querySelector('[data-slot="inputs"]')).toBeNull()
    expect(article.querySelector('[data-slot="outputs"]')).toBeNull()
  })
})
