import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasNode } from '../../types'
import { getNodeTypeConfig } from '../../types/nodeTypeRegistry'
import { clonePortDefinitions } from '../../types/portSchema'
import { AgentNodeConfigPanel } from './AgentNodeConfigPanel'

const mocks = vi.hoisted(() => ({
  listAgents: vi.fn(),
  listAgentVersions: vi.fn(),
  notify: vi.fn(),
  workflowId: 'wf-1' as string | null,
}))

vi.mock('@/features/agent/api/agentDefinitionApi', () => ({
  listAgents: mocks.listAgents,
  listAgentVersions: mocks.listAgentVersions,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

vi.mock('../../stores/canvasStore', () => ({
  useCanvasStore: (selector: (state: { workflowId: string | null }) => unknown) =>
    selector({ workflowId: mocks.workflowId }),
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
      {workflowDefinitionId}:{nodeId}
    </div>
  ),
}))

// legacy 内联字段落在 node.data 顶层，而不是 node.data.config 里
function createAgentNode(dataOverrides: Record<string, unknown> = {}): CanvasNode {
  const typeConfig = getNodeTypeConfig('agent')

  return {
    id: 'node-agent-1',
    type: typeConfig.category,
    position: { x: 0, y: 0 },
    data: {
      label: typeConfig.label,
      nodeType: typeConfig.type,
      category: typeConfig.category,
      description: typeConfig.description,
      config: {},
      inputPorts: clonePortDefinitions(typeConfig.inputPorts),
      outputPorts: clonePortDefinitions(typeConfig.outputPorts),
      ...dataOverrides,
    },
  }
}

describe('AgentNodeConfigPanel 的旧版内联配置展示', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.workflowId = 'wf-1'
    mocks.listAgents.mockResolvedValue({ data: [] })
    mocks.listAgentVersions.mockResolvedValue({ data: [] })
  })

  it('节点带有 legacy systemPrompt 时展示只读区块与提示词原文', async () => {
    const node = createAgentNode({ systemPrompt: '你是一名严谨的资料检索助手。\n请只引用给定材料。' })

    render(<AgentNodeConfigPanel node={node} config={node.data.config} onApply={vi.fn()} />)

    const block = await screen.findByTestId('agent-legacy-inline-config')
    expect(block).toHaveTextContent('你是一名严谨的资料检索助手。')
    expect(block).toHaveTextContent('请只引用给定材料。')
    expect(block).toHaveTextContent('已废除')
    expect(block).toHaveTextContent('系统提示词')
  })

  it('节点带有 legacy model 时展示模型值', async () => {
    const node = createAgentNode({ model: 'gpt-4o-mini' })

    render(<AgentNodeConfigPanel node={node} config={node.data.config} onApply={vi.fn()} />)

    const block = await screen.findByTestId('agent-legacy-inline-config')
    expect(block).toHaveTextContent('模型')
    expect(block).toHaveTextContent('gpt-4o-mini')
  })

  it('两个 legacy 字段都不存在时不渲染该区块', async () => {
    const node = createAgentNode()

    render(<AgentNodeConfigPanel node={node} config={node.data.config} onApply={vi.fn()} />)

    await waitFor(() => {
      expect(mocks.listAgents).toHaveBeenCalled()
    })
    expect(screen.queryByTestId('agent-legacy-inline-config')).not.toBeInTheDocument()
  })

  it('node.data.config 里的 snake_case system_prompt 也能被识别', async () => {
    const node = createAgentNode({ config: { system_prompt: '旧版落在 config 里的提示词' } })

    render(<AgentNodeConfigPanel node={node} config={node.data.config} onApply={vi.fn()} />)

    expect(await screen.findByTestId('agent-legacy-inline-config')).toHaveTextContent(
      '旧版落在 config 里的提示词',
    )
  })

  it('顶层 systemPrompt 优先于 config 中的同名字段', async () => {
    const node = createAgentNode({
      systemPrompt: '顶层提示词',
      config: { systemPrompt: 'config 中的提示词' },
    })

    render(<AgentNodeConfigPanel node={node} config={node.data.config} onApply={vi.fn()} />)

    const block = await screen.findByTestId('agent-legacy-inline-config')
    expect(block).toHaveTextContent('顶层提示词')
    expect(block).not.toHaveTextContent('config 中的提示词')
  })

  it('点击复制会写入剪贴板并给出成功反馈', async () => {
    // userEvent.setup() 会安装自己的剪贴板桩，必须在其之后覆盖
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const node = createAgentNode({ systemPrompt: '需要迁移的提示词' })

    render(<AgentNodeConfigPanel node={node} config={node.data.config} onApply={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: '复制' }))

    expect(writeText).toHaveBeenCalledWith('需要迁移的提示词')
    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' }),
      )
    })
  })

  it('剪贴板不可用时静默降级，不抛错也不提示成功', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const node = createAgentNode({ systemPrompt: '需要迁移的提示词' })

    render(<AgentNodeConfigPanel node={node} config={node.data.config} onApply={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: '复制' }))

    expect(mocks.notify).not.toHaveBeenCalled()
  })
})

describe('AgentNodeConfigPanel 的节点级优化建议接线', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.workflowId = 'wf-1'
    mocks.listAgents.mockResolvedValue({ data: [] })
    mocks.listAgentVersions.mockResolvedValue({ data: [] })
  })

  it('画布已有 workflowId 时渲染建议面板，并透传工作流与节点 id', async () => {
    const node = createAgentNode()

    render(<AgentNodeConfigPanel node={node} config={node.data.config} onApply={vi.fn()} />)

    expect(await screen.findByTestId('optimization-suggestions-panel-mock')).toHaveTextContent(
      'wf-1:node-agent-1',
    )
  })

  it('画布尚未保存（workflowId 为空）时不渲染建议面板', async () => {
    mocks.workflowId = null
    const node = createAgentNode()

    render(<AgentNodeConfigPanel node={node} config={node.data.config} onApply={vi.fn()} />)

    await waitFor(() => {
      expect(mocks.listAgents).toHaveBeenCalled()
    })
    expect(screen.queryByTestId('optimization-suggestions-panel-mock')).not.toBeInTheDocument()
  })
})
