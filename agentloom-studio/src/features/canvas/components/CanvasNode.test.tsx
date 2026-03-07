import { render, screen, within } from '@testing-library/react'
import type { NodeProps } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasNodeShell } from './CanvasNode'
import { clonePortDefinitions, getNodeTypeConfig } from '../types/nodeTypeRegistry'
import type { CanvasNode, CanvasNodeData } from '../types'

vi.mock('@xyflow/react', () => ({
  Handle: ({
    className,
    'data-testid': dataTestId,
    'data-port-type': dataPortType,
    'data-port-shape': dataPortShape,
    'data-port-state': dataPortState,
    'aria-label': ariaLabel,
  }: {
    className?: string
    'data-testid'?: string
    'data-port-type'?: string
    'data-port-shape'?: string
    'data-port-state'?: string
    'aria-label'?: string
  }) => (
    <button
      type="button"
      className={className}
      data-testid={dataTestId}
      data-port-type={dataPortType}
      data-port-shape={dataPortShape}
      data-port-state={dataPortState}
      aria-label={ariaLabel}
    />
  ),
  Position: { Left: 'left', Right: 'right' },
  useNodeConnections: vi.fn(() => []),
}))

function createMockNodeData(nodeType: Parameters<typeof getNodeTypeConfig>[0] = 'llm-agent'): CanvasNodeData {
  const config = getNodeTypeConfig(nodeType)

  return {
    label: config.label,
    nodeType: config.type,
    category: config.category,
    description: '执行多步推理',
    config: {},
    inputPorts: clonePortDefinitions(config.inputPorts),
    outputPorts: clonePortDefinitions(config.outputPorts),
  }
}

function renderNode(data: CanvasNodeData, overrides: Partial<NodeProps<CanvasNode>> = {}) {
  const props: NodeProps<CanvasNode> = {
    ...overrides,
    id: overrides.id ?? 'node-1',
    type: overrides.type ?? data.category,
    data,
    selected: overrides.selected ?? false,
    dragging: overrides.dragging ?? false,
    zIndex: overrides.zIndex ?? 0,
    selectable: overrides.selectable ?? true,
    deletable: overrides.deletable ?? true,
    draggable: overrides.draggable ?? true,
    isConnectable: overrides.isConnectable ?? true,
    positionAbsoluteX: overrides.positionAbsoluteX ?? 0,
    positionAbsoluteY: overrides.positionAbsoluteY ?? 0,
  }

  return render(<CanvasNodeShell {...props} />)
}

describe('CanvasNodeShell', () => {
  it('renders the required slots and header metadata', () => {
    renderNode(createMockNodeData())

    const node = screen.getByTestId('canvas-node-node-1')

    expect(node).toHaveAttribute('data-selected', 'false')
    expect(within(node).getByText('LLM Agent')).toBeInTheDocument()
    expect(within(node).getByText('Agent')).toBeInTheDocument()
    expect(within(node).getByText('llm-agent')).toBeInTheDocument()
    expect(within(node).getByText('大语言模型 Agent 节点')).toBeInTheDocument()
    expect(node.querySelector('[data-slot="header"]')).not.toBeNull()
    expect(node.querySelector('[data-slot="inputs"]')).not.toBeNull()
    expect(node.querySelector('[data-slot="body"]')).not.toBeNull()
    expect(node.querySelector('[data-slot="outputs"]')).not.toBeNull()
    expect(node.querySelector('[data-slot="state"]')).toHaveAttribute('data-state', 'idle')
  })

  it('marks selected nodes with a stable DOM attribute', () => {
    renderNode(createMockNodeData(), { id: 'node-2', selected: true })

    expect(screen.getByTestId('canvas-node-node-2')).toHaveAttribute('data-selected', 'true')
  })

  it('preserves explicitly empty port arrays without rehydrating defaults in the renderer', () => {
    renderNode(
      {
        ...createMockNodeData(),
        inputPorts: [],
        outputPorts: [],
      },
      { id: 'node-3' },
    )

    const node = screen.getByTestId('canvas-node-node-3')

    expect(node.querySelector('[data-slot="inputs"]')).toBeNull()
    expect(node.querySelector('[data-slot="outputs"]')).toBeNull()
  })

  it('prefers the provided description as a friendly subtitle', () => {
    renderNode(createMockNodeData('chat-agent'), { id: 'node-4' })

    expect(screen.getByText('执行多步推理')).toBeInTheDocument()
    expect(screen.getByText('chat-agent')).toBeInTheDocument()
  })
})
