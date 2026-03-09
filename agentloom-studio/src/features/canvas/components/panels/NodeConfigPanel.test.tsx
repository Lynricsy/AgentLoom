import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeExecutionState } from '@/features/execution/stores/executionStore'
import type { CanvasNode } from '../../types'
import { NodeConfigPanel } from './NodeConfigPanel'

const mocks = vi.hoisted(() => ({
  selectedNodeId: 'node-1' as string | null,
  node: null as CanvasNode | null,
  nodeState: null as NodeExecutionState | null,
  isExecutionActive: false,
  selectNode: vi.fn(),
  updateNodeData: vi.fn(),
}))

vi.mock('@/features/llm', () => ({
  LlmModelConfigPanel: () => <div>LLM Panel</div>,
  parseLlmModelConfig: () => null,
}))

vi.mock('../../types/nodeTypeRegistry', () => ({
  getNodeTypeConfig: () => ({ label: '手动触发器' }),
}))

vi.mock('../../stores/canvasStore', () => ({
  useCanvasStore: (selector: (state: { selectedNodeId: string | null; nodes: CanvasNode[] }) => unknown) =>
    selector({
      selectedNodeId: mocks.selectedNodeId,
      nodes: mocks.node ? [mocks.node] : [],
    }),
  useCanvasActions: () => ({
    selectNode: mocks.selectNode,
    updateNodeData: mocks.updateNodeData,
  }),
}))

vi.mock('@/features/execution/stores/executionStore', () => ({
  useNodeExecutionState: () => mocks.nodeState,
  useIsExecutionActive: () => mocks.isExecutionActive,
}))

vi.mock('./McpToolConfigPanel', () => ({
  McpToolConfigPanel: () => <div>MCP Panel</div>,
}))

vi.mock('./KnowledgeBaseConfigPanel', () => ({
  KnowledgeBaseConfigPanel: () => <div>Knowledge Panel</div>,
}))

vi.mock('./SandboxConfigPanel', () => ({
  SandboxConfigPanel: () => <div>Sandbox Panel</div>,
}))

function createNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'node-1',
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: {
      label: '手动触发',
      nodeType: 'manual-trigger',
      category: 'trigger',
      config: {},
      inputPorts: [],
      outputPorts: [],
      ...overrides.data,
    },
    ...overrides,
  }
}

describe('NodeConfigPanel', () => {
  beforeEach(() => {
    mocks.selectedNodeId = 'node-1'
    mocks.node = createNode()
    mocks.nodeState = null
    mocks.isExecutionActive = false
    mocks.selectNode.mockReset()
    mocks.updateNodeData.mockReset()
  })

  it('renders idle execution placeholder when there is no node execution state', () => {
    render(<NodeConfigPanel />)

    expect(screen.getByTestId('node-config-panel')).toBeInTheDocument()
    expect(screen.getByTestId('node-execution-status')).toHaveTextContent('空闲')
    expect(screen.getByTestId('node-execution-output')).toHaveTextContent(
      '选择节点后，这里会显示最近一次执行输出。',
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
})
