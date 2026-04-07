import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeExecutionState } from '@/features/execution/stores/executionStore'
import type { CanvasNode } from '../../types'
import { clonePortDefinitions, getNodeTypeConfig, type NodeType } from '../../types/nodeTypeRegistry'
import { NodeConfigPanel } from './NodeConfigPanel'

const mocks = vi.hoisted(() => ({
  selectedNodeId: 'node-1' as string | null,
  workflowId: 'wf-1' as string | null,
  node: null as CanvasNode | null,
  nodeState: null as NodeExecutionState | null,
  isExecutionActive: false,
  selectNode: vi.fn(),
  updateNodeData: vi.fn(),
  setNodeValidationError: vi.fn(),
}))

vi.mock('@/features/llm', () => ({
  LlmModelConfigPanel: () => <div>LLM Model Panel</div>,
  parseLlmModelConfig: () => null,
}))

vi.mock('../../stores/canvasStore', () => ({
  useCanvasStore: (selector: (state: {
    selectedNodeId: string | null
    workflowId: string | null
    nodes: CanvasNode[]
  }) => unknown) =>
    selector({
      selectedNodeId: mocks.selectedNodeId,
      workflowId: mocks.workflowId,
      nodes: mocks.node ? [mocks.node] : [],
    }),
  useCanvasActions: () => ({
    selectNode: mocks.selectNode,
    updateNodeData: mocks.updateNodeData,
    setNodeValidationError: mocks.setNodeValidationError,
  }),
  useCanvasNodes: () => (mocks.node ? [mocks.node] : []),
}))

vi.mock('@/features/execution/stores/executionStore', () => ({
  useNodeExecutionState: () => mocks.nodeState,
  useIsExecutionActive: () => mocks.isExecutionActive,
  useExecutionId: () => 'exec-1',
  useToolCalls: () => null,
  useExecutionActions: () => ({
    submitToolPermission: vi.fn(),
  }),
}))

vi.mock('./McpToolConfigPanel', () => ({
  McpToolConfigPanel: () => <div>MCP Panel</div>,
}))

vi.mock('./KnowledgeBaseConfigPanel', () => ({
  KnowledgeBaseConfigPanel: ({
    onValidationChange,
  }: {
    onValidationChange?: (hasErrors: boolean) => void
  }) => (
    <div>
      <span>Knowledge Panel</span>
      <button type="button" onClick={() => onValidationChange?.(true)}>
        触发知识库校验
      </button>
    </div>
  ),
}))

vi.mock('../../../agent-canvas/components/panels/SkillPanel', () => ({
  SkillPanel: () => <div>Skill Panel</div>,
}))

vi.mock('../../../agent-canvas/components/panels/SubAgentConfigPanel', () => ({
  SubAgentConfigPanel: () => <div>Sub Agent Panel</div>,
}))

vi.mock('./SandboxConfigPanel', () => ({
  SandboxConfigPanel: () => <div>Sandbox Panel</div>,
}))

vi.mock('./InterventionPanel', () => ({
  InterventionPanel: () => <div data-testid="intervention-panel-mock">Intervention Panel</div>,
}))

vi.mock('./LlmAgentConfigPanel', () => ({
  LlmAgentConfigPanel: ({ onValidationChange }: { onValidationChange?: (hasErrors: boolean) => void }) => (
    <div>
      <span>LLM Agent Panel</span>
      <button type="button" onClick={() => onValidationChange?.(true)}>
        触发 LLM Agent 校验
      </button>
    </div>
  ),
}))

vi.mock('./HttpToolConfigPanel', () => ({
  HttpToolConfigPanel: ({ onValidationChange }: { onValidationChange?: (hasErrors: boolean) => void }) => (
    <div>
      <span>HTTP Tool Panel</span>
      <button type="button" onClick={() => onValidationChange?.(true)}>
        触发 HTTP 校验
      </button>
    </div>
  ),
}))

vi.mock('./ReusableBlockPanel', () => ({
  ReusableBlockPanel: () => <div>Reusable Block Panel</div>,
}))

vi.mock('@/features/optimization-suggestion', () => ({
  OptimizationSuggestionsPanel: ({
    workflowDefinitionId,
    nodeId,
  }: {
    workflowDefinitionId: string
    nodeId: string
  }) => (
    <div data-testid="optimization-suggestions-panel-mock">
      Optimization Suggestions Panel {workflowDefinitionId}:{nodeId}
    </div>
  ),
}))

vi.mock('./DynamicConfigForm', () => ({
  DynamicConfigForm: ({
    configSchema,
    onValidationChange,
  }: {
    configSchema: { properties: Record<string, unknown> }
    onValidationChange?: (hasErrors: boolean) => void
  }) => (
    <div>
      <span>Dynamic Form: {Object.keys(configSchema.properties).join(', ')}</span>
      <button type="button" onClick={() => onValidationChange?.(true)}>
        触发动态表单校验
      </button>
    </div>
  ),
}))

function createNode(
  nodeType: NodeType | 'sub-agent' = 'manual-trigger',
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  const config = getNodeTypeConfig(nodeType as NodeType)

  return {
    id: 'node-1',
    type: config.category,
    position: { x: 0, y: 0 },
    data: {
      label: config.label,
      nodeType: config.type,
      category: config.category,
      description: config.description,
      config: {},
      inputPorts: clonePortDefinitions(config.inputPorts),
      outputPorts: clonePortDefinitions(config.outputPorts),
      ...overrides.data,
    },
    ...overrides,
  }
}

function createUnknownNode(): CanvasNode {
  return {
    id: 'node-legacy',
    type: 'tool',
    position: { x: 0, y: 0 },
    data: {
      label: 'Legacy Node',
      nodeType: 'legacy-node' as CanvasNode['data']['nodeType'],
      category: 'tool',
      description: '历史节点',
      config: {},
      inputPorts: [],
      outputPorts: [],
    },
  }
}

describe('NodeConfigPanel', () => {
  beforeEach(() => {
    mocks.selectedNodeId = 'node-1'
    mocks.workflowId = 'wf-1'
    mocks.node = createNode()
    mocks.nodeState = null
    mocks.isExecutionActive = false
    mocks.selectNode.mockReset()
    mocks.updateNodeData.mockReset()
    mocks.setNodeValidationError.mockReset()
  })

  it('renders idle execution placeholder when there is no node execution state', () => {
    render(<NodeConfigPanel />)

    expect(screen.getByTestId('node-config-panel')).toBeInTheDocument()
    expect(screen.getByTestId('node-execution-status')).toHaveTextContent('空闲')
    expect(screen.getByTestId('node-execution-output')).toHaveTextContent(
      '选择节点后，这里会显示最近一次执行输出。',
    )
  })

  it('未知节点类型时应展示降级提示而不是抛错', () => {
    mocks.node = createUnknownNode()
    mocks.selectedNodeId = 'node-legacy'

    render(<NodeConfigPanel />)

    expect(screen.getByText('Legacy Node')).toBeInTheDocument()
    expect(screen.getByText('当前节点类型暂不受支持')).toBeInTheDocument()
    expect(
      screen.getByText(/已检测到未知节点类型/, { exact: false }),
    ).toBeInTheDocument()
    expect(mocks.setNodeValidationError).toHaveBeenCalledWith(
      'node-legacy',
      false,
    )
  })

  it('renders waiting placeholder while execution is active but the node has not started', () => {
    mocks.isExecutionActive = true

    render(<NodeConfigPanel />)

    expect(screen.getByTestId('node-execution-status')).toHaveTextContent('待运行')
    expect(screen.getByTestId('node-execution-output')).toHaveTextContent(
      '节点尚未开始运行，输出会在执行后显示。',
    )
  })

  it('renders streaming output and execution metadata for the selected node', () => {
    mocks.isExecutionActive = true
    mocks.nodeState = {
      stepId: 'step-42',
      nodeId: 'node-1',
      status: 'running',
      output: '第一行输出\n第二行输出',
      isStreaming: true,
      startedAt: '2026-03-10T10:00:00.000Z',
      toolCalls: {},
      agentEvents: [],
    }

    render(<NodeConfigPanel />)

    expect(screen.getByTestId('node-execution-status')).toHaveTextContent('执行中')
    expect(screen.getByText('流式输出中')).toBeInTheDocument()
    expect(screen.getByText('step-42')).toBeInTheDocument()
    expect(screen.getByText('接收中')).toBeInTheDocument()
    expect(screen.getByTestId('node-execution-output')).toHaveTextContent('第一行输出')
    expect(screen.getByTestId('node-execution-output')).toHaveTextContent('第二行输出')
  })

  it('renders retry and error details for failed nodes', () => {
    mocks.nodeState = {
      stepId: 'step-9',
      nodeId: 'node-1',
      status: 'failed',
      output: '',
      isStreaming: false,
      retryAttempt: 2,
      retryMaxAttempts: 3,
      errorMessage: '调用模型超时',
      completedAt: '2026-03-10T10:05:00.000Z',
      toolCalls: {},
      agentEvents: [],
    }

    render(<NodeConfigPanel />)

    expect(screen.getByTestId('node-execution-status')).toHaveTextContent('失败')
    expect(screen.getByTestId('node-execution-error')).toHaveTextContent('调用模型超时')
    expect(screen.getByText('2/3')).toBeInTheDocument()
    expect(screen.getByTestId('node-execution-output')).toHaveTextContent(
      '节点执行失败，暂无可展示的输出内容。',
    )
  })

  it('closes the panel through canvas selection action', async () => {
    const user = userEvent.setup()

    render(<NodeConfigPanel />)
    await user.click(screen.getByRole('button', { name: '关闭配置面板' }))

    expect(mocks.selectNode).toHaveBeenCalledWith(null)
  })

  it.each([
    ['llm-model', 'LLM Model Panel'],
    ['mcp-tool', 'MCP Panel'],
    ['knowledge-base', 'Knowledge Panel'],
    ['skill', 'Skill Panel'],
    ['sub-agent', 'Sub Agent Panel'],
    ['sandbox', 'Sandbox Panel'],
    ['http-tool', 'HTTP Tool Panel'],
    ['reusable-block', 'Reusable Block Panel'],
  ] as const)('prefers the custom panel mapping for %s nodes', (nodeType, panelText) => {
    mocks.node = createNode(nodeType)

    render(<NodeConfigPanel />)

    expect(screen.getByText(panelText)).toBeInTheDocument()
    expect(screen.queryByText(/^Dynamic Form:/)).not.toBeInTheDocument()
  })

  it('falls back to the schema-driven dynamic form when no custom panel is registered', () => {
    mocks.node = createNode('chat-agent')

    render(<NodeConfigPanel />)

    expect(screen.getByText('Dynamic Form: systemPrompt')).toBeInTheDocument()
  })

  it('shows the empty state when a node has no additional config schema', () => {
    mocks.node = createNode('text-output')

    render(<NodeConfigPanel />)

    expect(screen.getByText('该节点无需额外配置')).toBeInTheDocument()
  })

  it('forwards validation state changes from custom config panels to the canvas store', async () => {
    const user = userEvent.setup()
    mocks.node = createNode('http-tool')

    render(<NodeConfigPanel />)
    await user.click(screen.getByRole('button', { name: '触发 HTTP 校验' }))

    expect(mocks.setNodeValidationError).toHaveBeenCalledWith('node-1', true)
  })

  it('forwards validation state changes from knowledge-base panels to the canvas store', async () => {
    const user = userEvent.setup()
    mocks.node = createNode('knowledge-base')

    render(<NodeConfigPanel />)
    await user.click(screen.getByRole('button', { name: '触发知识库校验' }))

    expect(mocks.setNodeValidationError).toHaveBeenCalledWith('node-1', true)
  })

  it('forwards validation state changes from dynamic config forms to the canvas store', async () => {
    const user = userEvent.setup()
    mocks.node = createNode('chat-agent')

    render(<NodeConfigPanel />)
    await user.click(screen.getByRole('button', { name: '触发动态表单校验' }))

    expect(mocks.setNodeValidationError).toHaveBeenCalledWith('node-1', true)
  })
})
