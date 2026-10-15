import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEAM_PRESET_TRIAGE } from '@agentloom/contracts'
import { TeamConfigPanel } from '../TeamConfigPanel'

const mocks = vi.hoisted(() => ({
  useAgentList: vi.fn(),
}))

vi.mock('@/features/agent', () => ({
  useAgentList: mocks.useAgentList,
}))

const AGENT_A = '0190f2a4-1c3b-7a6e-9f00-000000000001'
const AGENT_B = '0190f2a4-1c3b-7a6e-9f00-000000000002'

function createValidConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    objective: '修复登录超时',
    members: [
      {
        role: 'locator',
        agentDefinitionId: AGENT_A,
        agentVersionId: null,
        isLead: false,
        instructions: '',
        canMessage: ['implementer'],
      },
      {
        role: 'implementer',
        agentDefinitionId: AGENT_B,
        agentVersionId: null,
        isLead: true,
        instructions: '',
        canMessage: ['*'],
      },
    ],
    budget: { maxTotalTokens: 100000, maxMessages: 30, deadlineMinutes: 10 },
    outputSchema: null,
    ...overrides,
  }
}

describe('TeamConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAgentList.mockReturnValue({
      data: {
        data: [
          { id: AGENT_A, name: '定位 Agent' },
          { id: AGENT_B, name: '实现 Agent' },
        ],
      },
      isLoading: false,
    })
  })

  it('合法配置上报无错误，并只拉取已发布 Agent', async () => {
    const onValidationChange = vi.fn()
    render(
      <TeamConfigPanel
        config={createValidConfig()}
        onApply={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    )

    await waitFor(() => expect(onValidationChange).toHaveBeenLastCalledWith(false))
    expect(mocks.useAgentList).toHaveBeenCalledWith({ status: 'published', pageSize: 100 })
    expect(screen.queryByTestId('team-config-errors')).not.toBeInTheDocument()
  })

  it('应用三角色模板写入预设成员且 Agent 留空待选', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<TeamConfigPanel config={{}} onApply={onApply} onValidationChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '应用三角色模板' }))

    expect(onApply).toHaveBeenCalledTimes(1)
    const applied = onApply.mock.calls[0]?.[0] as { members: Array<Record<string, unknown>> }
    expect(applied.members).toEqual(
      TEAM_PRESET_TRIAGE.map((preset) => ({
        role: preset.role,
        agentDefinitionId: '',
        agentVersionId: null,
        isLead: preset.isLead,
        instructions: preset.instructions,
        canMessage: [...preset.canMessage],
      })),
    )
  })

  it('两个负责人时上报无效并显示原因', async () => {
    const onValidationChange = vi.fn()
    const config = createValidConfig()
    const members = config.members as Array<Record<string, unknown>>
    members[0] = { ...members[0], isLead: true }

    render(
      <TeamConfigPanel config={config} onApply={vi.fn()} onValidationChange={onValidationChange} />,
    )

    await waitFor(() => expect(onValidationChange).toHaveBeenLastCalledWith(true))
    expect(screen.getByTestId('team-config-errors')).toHaveTextContent('恰好有一个负责人')
  })

  it('输出 Schema 不是合法 JSON 时显示错误并上报无效', async () => {
    const onValidationChange = vi.fn()
    const onApply = vi.fn()
    render(
      <TeamConfigPanel
        config={createValidConfig()}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    )
    await waitFor(() => expect(onValidationChange).toHaveBeenLastCalledWith(false))

    fireEvent.change(screen.getByLabelText('输出 Schema（可选）'), {
      target: { value: '{"type": "object",' },
    })

    expect(await screen.findByText(/JSON 解析失败/)).toBeInTheDocument()
    await waitFor(() => expect(onValidationChange).toHaveBeenLastCalledWith(true))
    expect(onApply).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('输出 Schema（可选）'), {
      target: { value: '{"type": "object"}' },
    })

    await waitFor(() => expect(onValidationChange).toHaveBeenLastCalledWith(false))
    expect(onApply).toHaveBeenLastCalledWith(
      expect.objectContaining({ outputSchema: { type: 'object' } }),
    )
  })
})
