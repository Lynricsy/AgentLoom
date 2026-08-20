import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentDefinitionSummary,
  AgentVersion,
} from '@/features/agent'
import { SubAgentConfigPanel } from './SubAgentConfigPanel'

const mocks = vi.hoisted(() => {
  const selectedAgent: AgentDefinitionSummary = {
    id: 'agent-2',
    tenantId: 'tenant-1',
    name: 'Review Agent',
    slug: 'review-agent',
    description: '负责代码审查',
    icon: null,
    runtimeMode: 'sandbox' as const,
    resourceSourceKind: 'manual',
    version: 1,
    status: 'published' as const,
    publishedVersionId: 'version-2',
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  }

  return {
    useAgentVersions: vi.fn(),
    agentId: 'agent-current',
    nodes: [] as Array<{ data: Record<string, unknown> }>,
    selectedAgent,
  }
})

vi.mock('@/features/agent', () => ({
  useAgentVersions: mocks.useAgentVersions,
}))

vi.mock('../../stores/agent-canvas.store', () => ({
  useAgentCanvasStore: (selector: (state: { agentId: string | null }) => unknown) =>
    selector({ agentId: mocks.agentId }),
  useAgentCanvasNodes: () => mocks.nodes,
}))

vi.mock('../AgentSearchPicker', () => ({
  AgentSearchPicker: ({
    onSelect,
    onClear,
  }: {
    onSelect: (agent: AgentDefinitionSummary) => void
    onClear: () => void
  }) => (
    <div>
      <button type="button" onClick={() => onSelect(mocks.selectedAgent)}>
        选择 Agent
      </button>
      <button type="button" onClick={onClear}>
        清除 Agent
      </button>
    </div>
  ),
}))

function createVersion(overrides: Partial<AgentVersion> = {}): AgentVersion {
  return {
    id: 'version-2',
    agentDefinitionId: 'agent-2',
    tenantId: 'tenant-1',
    versionNumber: 2,
    label: '稳定版',
    snapshot: {
      nodes: [],
      edges: [],
      viewport: null,
      metadata: {
        nodeCount: 0,
        edgeCount: 0,
        createdFromVersion: 1,
      },
    },
    publishedAt: '2026-03-02T00:00:00Z',
    archivedAt: null,
    createdBy: 'user-1',
    createdAt: '2026-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('SubAgentConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.nodes = []
    mocks.useAgentVersions.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    })
  })

  it('选择 agent 时生成 alias 并回填元数据', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(<SubAgentConfigPanel config={{}} onApply={onApply} />)

    await user.click(screen.getByRole('button', { name: '选择 Agent' }))

    expect(onApply).toHaveBeenCalledWith({
      agentDefinitionId: 'agent-2',
      alias: 'review-agent',
      _agentName: 'Review Agent',
      _agentDescription: '负责代码审查',
      _versionLabel: '',
    })
    // contracts 的 agentVersionId 是可选字段，"最新发布版" 必须是键缺失而非 null
    expect(onApply.mock.calls[0]?.[0]).not.toHaveProperty('agentVersionId')
    expect(screen.getByDisplayValue('review-agent')).toBeInTheDocument()
  })

  it('对非法 alias 显示校验错误且不写回 patch', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    render(
      <SubAgentConfigPanel
        config={{
          agentDefinitionId: 'agent-2',
          alias: 'review-agent',
          _agentName: 'Review Agent',
        }}
        onApply={onApply}
      />,
    )

    const aliasInput = screen.getByLabelText(/别名/)
    await user.clear(aliasInput)
    await user.type(aliasInput, '1 bad alias')

    expect(
      screen.getByText('别名必须以字母开头，仅包含字母、数字、下划线和连字符'),
    ).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('选择版本时写回版本 id 与展示标签', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    mocks.useAgentVersions.mockReturnValue({
      data: {
        data: [createVersion()],
      },
      isLoading: false,
    })

    render(
      <SubAgentConfigPanel
        config={{
          agentDefinitionId: 'agent-2',
          alias: 'review-agent',
          _agentName: 'Review Agent',
        }}
        onApply={onApply}
      />,
    )

    const versionSelect = screen.getByRole('combobox', { name: '版本' })
    expect(versionSelect).toHaveTextContent('最新发布版')

    // Radix Select 是 button + portal，选项只在展开后进入无障碍树
    await user.click(versionSelect)
    await user.click(await screen.findByRole('option', { name: 'v2 — 稳定版' }))

    expect(onApply).toHaveBeenCalledWith({
      agentDefinitionId: 'agent-2',
      alias: 'review-agent',
      _agentName: 'Review Agent',
      agentVersionId: 'version-2',
      _versionLabel: 'v2 (稳定版)',
    })
  })

  it('选回最新发布版时移除版本 id 与展示标签', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()

    mocks.useAgentVersions.mockReturnValue({
      data: {
        data: [createVersion()],
      },
      isLoading: false,
    })

    render(
      <SubAgentConfigPanel
        config={{
          agentDefinitionId: 'agent-2',
          alias: 'review-agent',
          _agentName: 'Review Agent',
          agentVersionId: 'version-2',
          _versionLabel: 'v2 (稳定版)',
        }}
        onApply={onApply}
      />,
    )

    const versionSelect = screen.getByRole('combobox', { name: '版本' })
    expect(versionSelect).toHaveTextContent('v2 — 稳定版')

    await user.click(versionSelect)
    await user.click(await screen.findByRole('option', { name: '最新发布版' }))

    expect(onApply).toHaveBeenCalledWith({
      agentDefinitionId: 'agent-2',
      alias: 'review-agent',
      _agentName: 'Review Agent',
      _versionLabel: '',
    })
    expect(onApply.mock.calls[0]?.[0]).not.toHaveProperty('agentVersionId')
  })
})
