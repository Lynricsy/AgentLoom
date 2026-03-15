import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { NodeProps } from '@xyflow/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUTONOMY_CONFIG } from '../autonomy.types'
import { createDefaultAgentNodeData } from '../types'
import { useCanvasStore } from '../stores/canvasStore'
import { useExecutionStore, type NodeExecutionState } from '@/features/execution/stores/executionStore'
import { CanvasNodeShell } from './CanvasNode'
import { clonePortDefinitions, getNodeTypeConfig } from '../types/nodeTypeRegistry'
import type { CanvasNode, CanvasNodeData } from '../types'
import type { LevelOfDetail } from '../hooks/useLevelOfDetail'

const nodeShellMocks = vi.hoisted(() => ({
  mockUseLevelOfDetail: vi.fn<() => LevelOfDetail>(() => 'full'),
}))

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

vi.mock('../hooks/useLevelOfDetail', () => ({
  useLevelOfDetail: () => nodeShellMocks.mockUseLevelOfDetail(),
}))

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

function createExecutionState(
  status: NodeExecutionState['status'],
  overrides: Partial<NodeExecutionState> = {},
): NodeExecutionState {
  return {
    stepId: 'step-1',
    nodeId: 'node-1',
    status,
    output: '',
    isStreaming: false,
    toolCalls: {},
    agentEvents: [],
    ...overrides,
  }
}

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
    useExecutionStore.getState().actions.reset()
    llmModuleMocks.resetMockApiKeys()
    llmModuleMocks.mockUseLlmApiKeys.mockClear()
    nodeShellMocks.mockUseLevelOfDetail.mockReturnValue('full')
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
    expect(within(node).getByText('手动确认')).toBeInTheDocument()
    expect(within(node).getByText('关键输入需人工确认')).toBeInTheDocument()
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

  it('renders llm-agent autonomy summary from node.data.autonomyConfig mode', () => {
    const { rerender } = renderNode(
      {
        ...createMockNodeData(),
        ...createDefaultAgentNodeData(),
        autonomyConfig: {
          ...DEFAULT_AUTONOMY_CONFIG,
          mode: 'RULE_BASED',
          allowedInferenceFields: ['context.topic'],
          fallbackStrategy: 'USE_DEFAULT',
        },
      },
      { id: 'llm-agent-summary' },
    )

    const node = screen.getByTestId('canvas-node-llm-agent-summary')

    expect(within(node).getByText('规则补全')).toBeInTheDocument()

    rerender(
      <CanvasNodeShell
        id="llm-agent-summary"
        type="agent"
        data={{
          ...createMockNodeData(),
          ...createDefaultAgentNodeData(),
          autonomyConfig: {
            ...DEFAULT_AUTONOMY_CONFIG,
            mode: 'LLM_SUGGEST',
            allowedInferenceFields: ['context.topic'],
            confirmationThreshold: 0.65,
            fallbackStrategy: 'ABORT_EXECUTION',
          },
        }}
        selected={false}
        dragging={false}
        zIndex={0}
        selectable
        deletable
        draggable
        isConnectable
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />,
    )

    expect(within(node).getByText('LLM 建议')).toBeInTheDocument()
    expect(within(node).getByText('阈值 0.65 · 失败终止')).toBeInTheDocument()
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

  it('marks private_cloud llm-model nodes as warning when api_key auth has no explicit or default key', () => {
    llmModuleMocks.setMockApiKeys([])

    renderNode(
      {
        ...createMockNodeData('llm-model'),
        config: {
          llmConfigId: 'config-private-cloud-warning',
          name: '私有云配置',
          provider: 'private_cloud',
          modelName: 'llama-3-70b',
          parameters: {
            temperature: 0.4,
            topP: 1,
            frequencyPenalty: 0,
            presencePenalty: 0,
            stop: [],
          },
          apiKeyId: null,
          endpointUrl: 'https://private-cloud.example.com/v1',
          authMethod: 'api_key',
        },
      },
      { id: 'llm-node-private-cloud-warning' },
    )

    const node = screen.getByTestId('canvas-node-llm-node-private-cloud-warning')

    expect(node.querySelector('[data-slot="state"]')).toHaveAttribute('data-state', 'warning')
    expect(within(node).getByText('缺少 API Key')).toBeInTheDocument()
    expect(within(node).getByRole('heading', { name: 'llama-3-70b' })).toBeInTheDocument()
  })

  it('treats private_cloud default api keys as configured when explicit key is absent', () => {
    llmModuleMocks.setMockApiKeys([
      {
        id: 'key-private-cloud-default',
        provider: 'private_cloud',
        label: '默认 Private Cloud Key',
        keyPreview: 'sk-****',
        isDefault: true,
        status: 'active',
      },
    ])

    renderNode(
      {
        ...createMockNodeData('llm-model'),
        label: '私有云 LLM',
        config: {
          llmConfigId: 'config-private-cloud-default',
          name: '默认私有云模型',
          provider: 'private_cloud',
          modelName: 'qwen-2.5-72b',
          parameters: {
            temperature: 0.5,
            topP: 1,
            frequencyPenalty: 0,
            presencePenalty: 0,
            stop: [],
          },
          apiKeyId: null,
          endpointUrl: 'https://private-cloud.example.com/v1',
          authMethod: 'api_key',
          isDefault: false,
        },
      },
      { id: 'llm-node-private-cloud-default-key' },
    )

    const node = screen.getByTestId('canvas-node-llm-node-private-cloud-default-key')

    expect(node.querySelector('[data-slot="state"]')).toHaveAttribute('data-state', 'configured')
    expect(within(node).queryByText('缺少 API Key')).not.toBeInTheDocument()
    expect(within(node).getByRole('heading', { name: 'qwen-2.5-72b' })).toBeInTheDocument()
  })

  it('renders compact mode with icon, title, and a compact status badge while hiding body details', () => {
    nodeShellMocks.mockUseLevelOfDetail.mockReturnValue('compact' as LevelOfDetail)
    useExecutionStore.setState((state) => ({
      ...state,
      status: 'running',
      nodes: {
        'node-compact': createExecutionState('running', { nodeId: 'node-compact' }),
      },
    }))

    renderNode(createMockNodeData(), { id: 'node-compact' })

    const node = screen.getByTestId('canvas-node-node-compact')

    expect(node).toHaveAttribute('data-lod', 'compact')
    expect(screen.getByTestId('canvas-node-icon-node-compact')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-node-status-badge-node-compact')).toHaveTextContent('运行中')
    expect(node.querySelector('[data-slot="body"]')).toBeNull()
    expect(within(node).queryByText('Tools')).not.toBeInTheDocument()
  })

  it('renders minimal mode as an icon-only square while keeping handles functional during execution', () => {
    nodeShellMocks.mockUseLevelOfDetail.mockReturnValue('minimal' as LevelOfDetail)
    useExecutionStore.setState((state) => ({
      ...state,
      status: 'running',
      nodes: {
        'node-minimal': createExecutionState('running', { nodeId: 'node-minimal' }),
      },
    }))

    renderNode(createMockNodeData(), { id: 'node-minimal' })

    const node = screen.getByTestId('canvas-node-node-minimal')

    expect(node).toHaveAttribute('data-lod', 'minimal')
    expect(node).toHaveAttribute('data-shell-status', 'running')
    expect(screen.getByTestId('canvas-node-icon-node-minimal')).toBeInTheDocument()
    expect(node.querySelector('[data-slot="icon-only"]')).not.toBeNull()
    expect(within(node).queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('exec-overlay-node-minimal')).not.toBeInTheDocument()
    expect(node.querySelector('[data-slot="inputs"]')).toBeNull()
    expect(node.querySelector('[data-slot="outputs"]')).toBeNull()
    expect(node.querySelector('[data-slot="body"]')).toBeNull()
    expect(node.querySelectorAll('.port-row')).toHaveLength(0)
    expect(screen.getByTestId('port-node-minimal-tools-input')).toBeInTheDocument()
    expect(screen.getByTestId('port-node-minimal-final-output-output')).toBeInTheDocument()
  })

  it('shows a single validation warning badge outside minimal mode', () => {
    useCanvasStore.getState().actions.setNodeValidationError('node-warning', true)

    renderNode(createMockNodeData(), { id: 'node-warning' })

    expect(screen.getByTestId('canvas-node-validation-badge-node-warning')).toBeInTheDocument()
  })

  it('hides the validation warning badge in minimal mode', () => {
    nodeShellMocks.mockUseLevelOfDetail.mockReturnValue('minimal' as LevelOfDetail)
    useCanvasStore.getState().actions.setNodeValidationError('node-warning-minimal', true)

    renderNode(createMockNodeData(), { id: 'node-warning-minimal' })

    expect(screen.queryByTestId('canvas-node-validation-badge-node-warning-minimal')).not.toBeInTheDocument()
  })

  it.each([
    ['running', 'running'],
    ['failed', 'failed'],
    ['waiting_intervention', 'waiting_intervention'],
    ['queued', 'queued'],
  ] as const)('applies execution shell visuals for %s nodes', (status, shellStatus) => {
    useExecutionStore.setState((state) => ({
      ...state,
      status: status === 'failed' ? 'failed' : 'running',
      nodes: {
        'node-shell': createExecutionState(status, { nodeId: 'node-shell' }),
      },
    }))

    renderNode(createMockNodeData(), { id: 'node-shell' })

    expect(screen.getByTestId('canvas-node-node-shell')).toHaveAttribute('data-shell-status', shellStatus)
    expect(screen.getByTestId('canvas-node-shell-accent-node-shell')).toHaveAttribute(
      'data-shell-status',
      shellStatus,
    )
  })

  it('fades the completed shell accent after roughly two seconds', () => {
    vi.useFakeTimers()
    useExecutionStore.setState((state) => ({
      ...state,
      status: 'completed',
      nodes: {
        'node-completed': createExecutionState('completed', { nodeId: 'node-completed' }),
      },
    }))

    renderNode(createMockNodeData(), { id: 'node-completed' })

    const node = screen.getByTestId('canvas-node-node-completed')

    expect(node).toHaveAttribute('data-shell-status', 'completed')
    expect(screen.getByTestId('canvas-node-shell-accent-node-completed')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(node).toHaveAttribute('data-shell-status', 'idle')
    expect(screen.getByTestId('exec-overlay-node-completed')).toHaveAttribute(
      'data-exec-status',
      'completed',
    )
    expect(screen.queryByTestId('canvas-node-shell-accent-node-completed')).not.toBeInTheDocument()
  })
})
