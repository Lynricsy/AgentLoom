import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { NodeProps } from '@xyflow/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../stores/canvasStore'
import { CanvasNodeShell } from './CanvasNode'
import { clonePortDefinitions, getNodeTypeConfig } from '../types/nodeTypeRegistry'
import type { CanvasNode, CanvasNodeData } from '../types'

const llmModuleMocks = vi.hoisted(() => {
  let mockApiKeys: Array<Record<string, unknown>> = []

  return {
    mockUseLlmApiKeys: vi.fn(() => ({ data: mockApiKeys })),
    resetMockApiKeys: () => {
      mockApiKeys = []
    },
    setMockApiKeys: (next: Array<Record<string, unknown>>) => {
      mockApiKeys = next
    },
  }
})

vi.mock('@/features/llm', async () => {
  const actual = await vi.importActual<typeof import('@/features/llm')>('@/features/llm')

  return {
    ...actual,
    useLlmApiKeys: llmModuleMocks.mockUseLlmApiKeys,
  }
})

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
  beforeEach(() => {
    useCanvasStore.getState().actions.reset()
    llmModuleMocks.resetMockApiKeys()
    llmModuleMocks.mockUseLlmApiKeys.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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

  it('renders mcp-tool nodes with MCP badge and dynamic port labels', () => {
    renderNode(
      {
        label: 'Search Tool',
        nodeType: 'mcp-tool',
        category: 'tool',
        description: '搜索知识库',
        config: {
          inputSchema: { type: 'object' },
        },
        inputPorts: [
          {
            id: 'query',
            label: 'Query',
            direction: 'input',
            dataType: 'text',
            required: true,
            multiple: false,
            maxConnections: 1,
            schema: { kind: 'text', title: 'Query' },
          },
        ],
        outputPorts: [
          {
            id: 'tool-output',
            label: 'Tool',
            direction: 'output',
            dataType: 'tool',
            required: false,
            multiple: false,
            maxConnections: 1,
            schema: { kind: 'tool', title: 'Tool' },
          },
        ],
        mcpToolDefinitionId: 'tool-1',
      },
      { id: 'mcp-node' },
    )

    const node = screen.getByTestId('canvas-node-mcp-node')

    expect(within(node).getByRole('heading', { name: 'Search Tool' })).toBeInTheDocument()
    expect(within(node).getByText('MCP')).toBeInTheDocument()
    expect(within(node).getAllByText('搜索知识库')).toHaveLength(2)
    expect(within(node).getByText('1入 / 1出')).toBeInTheDocument()
    expect(within(node).getByText('Query')).toBeInTheDocument()
    expect(within(node).getAllByText('Tool')).not.toHaveLength(0)
  })

  it('applies search highlight classes based on current search state', () => {
    useCanvasStore.setState((state) => ({
      ...state,
      isSearchOpen: true,
      searchQuery: 'agent',
      searchMatchIds: ['node-1', 'node-2'],
      currentSearchIndex: 0,
    }))

    renderNode(createMockNodeData(), { id: 'node-1' })
    renderNode(createMockNodeData(), { id: 'node-2' })
    renderNode(createMockNodeData(), { id: 'node-3' })

    expect(screen.getByTestId('canvas-node-node-1')).toHaveClass('search-current')
    expect(screen.getByTestId('canvas-node-node-2')).toHaveClass('search-match')
    expect(screen.getByTestId('canvas-node-node-3')).toHaveClass('search-dimmed')
  })

  it('sets hovered node after 300ms and clears it on mouse leave', () => {
    vi.useFakeTimers()
    renderNode(createMockNodeData(), { id: 'node-hover' })

    const node = screen.getByTestId('canvas-node-node-hover')

    fireEvent.mouseEnter(node)
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(useCanvasStore.getState().hoveredNodeId).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(useCanvasStore.getState().hoveredNodeId).toBe('node-hover')

    fireEvent.mouseLeave(node)
    expect(useCanvasStore.getState().hoveredNodeId).toBeNull()
  })

  it('renders llm-model nodes as unconfigured when no valid config is present', () => {
    renderNode(createMockNodeData('llm-model'), { id: 'llm-node-empty' })

    const node = screen.getByTestId('canvas-node-llm-node-empty')

    expect(node.querySelector('[data-slot="state"]')).toHaveAttribute('data-state', 'unconfigured')
    expect(within(node).getAllByText('点击配置模型')).toHaveLength(2)
    expect(within(node).queryByText('缺少 API Key')).not.toBeInTheDocument()
  })

  it('treats provider default api keys as configured for llm-model nodes', () => {
    llmModuleMocks.setMockApiKeys([
      {
        id: 'key-default',
        provider: 'openai',
        label: '默认 OpenAI Key',
        keyPreview: 'sk-****',
        isDefault: true,
        status: 'active',
      },
    ])

    renderNode(
      {
        ...createMockNodeData('llm-model'),
        label: 'LLM 模型',
        config: {
          llmConfigId: 'config-openai',
          name: '默认 GPT-4o',
          provider: 'openai',
          modelName: 'gpt-4o',
          parameters: {
            temperature: 0.7,
            topP: 1,
            frequencyPenalty: 0,
            presencePenalty: 0,
            stop: [],
          },
          apiKeyId: null,
          isDefault: true,
        },
      },
      { id: 'llm-node-default-key' },
    )

    const node = screen.getByTestId('canvas-node-llm-node-default-key')

    expect(node.querySelector('[data-slot="state"]')).toHaveAttribute('data-state', 'configured')
    expect(within(node).getByRole('heading', { name: 'gpt-4o' })).toBeInTheDocument()
    expect(within(node).getByText('OpenAI · 默认 GPT-4o')).toBeInTheDocument()
    expect(within(node).queryByText('缺少 API Key')).not.toBeInTheDocument()
  })

  it('marks llm-model nodes as warning when neither explicit nor default api keys exist', () => {
    renderNode(
      {
        ...createMockNodeData('llm-model'),
        config: {
          llmConfigId: 'config-anthropic',
          name: 'Claude Sonnet',
          provider: 'anthropic',
          modelName: 'claude-3-7-sonnet',
          parameters: {
            temperature: 0.3,
            topP: 0.9,
            frequencyPenalty: 0,
            presencePenalty: 0,
            stop: [],
          },
          apiKeyId: null,
        },
      },
      { id: 'llm-node-warning' },
    )

    const node = screen.getByTestId('canvas-node-llm-node-warning')

    expect(node.querySelector('[data-slot="state"]')).toHaveAttribute('data-state', 'warning')
    expect(within(node).getByText('缺少 API Key')).toBeInTheDocument()
    expect(within(node).getByRole('heading', { name: 'claude-3-7-sonnet' })).toBeInTheDocument()
  })
})
