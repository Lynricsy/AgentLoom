import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clonePortDefinitions, getNodeTypeConfig } from '@/features/canvas'
import { InterventionPolicyTab } from '../InterventionPolicyTab'

const notifyMock = vi.fn()
const useInterventionPoliciesMock = vi.fn()
const useResolvedInterventionPolicyMock = vi.fn()
const createMutationMock = vi.fn()
const updateMutationMock = vi.fn()
const deleteMutationMock = vi.fn()

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

vi.mock('../../api/interventionPolicyQueries', () => ({
  useInterventionPolicies: (...args: unknown[]) => useInterventionPoliciesMock(...args),
  useResolvedInterventionPolicy: (...args: unknown[]) => useResolvedInterventionPolicyMock(...args),
  useCreateInterventionPolicy: () => ({
    mutateAsync: createMutationMock,
    isPending: false,
  }),
  useUpdateInterventionPolicy: () => ({
    mutateAsync: updateMutationMock,
    isPending: false,
  }),
  useDeleteInterventionPolicy: () => ({
    mutateAsync: deleteMutationMock,
    isPending: false,
  }),
}))

function createNode(nodeType: Parameters<typeof getNodeTypeConfig>[0], id: string, label: string) {
  const config = getNodeTypeConfig(nodeType)

  return {
    id,
    type: config.category,
    position: { x: 0, y: 0 },
    data: {
      label,
      nodeType: config.type,
      category: config.category,
      description: config.description,
      config: {},
      inputPorts: clonePortDefinitions(config.inputPorts),
      outputPorts: clonePortDefinitions(config.outputPorts),
    },
  }
}

const workflowPolicy = {
  id: 'policy-workflow',
  workflowId: 'wf-001',
  nodeId: null,
  allowedRoles: ['owner', 'admin'],
  timeoutSeconds: 86400,
  timeoutAction: 'reject',
  escalateToRole: null,
  notifyChannels: ['in_app'],
  version: 5,
}

const workflowResolvedPolicy = {
  allowedRoles: ['owner', 'admin'],
  timeoutSeconds: 86400,
  timeoutAction: 'reject',
  escalateToRole: null,
  notifyChannels: ['in_app'],
  source: 'workflow',
}

const nodeResolvedPolicy = {
  allowedRoles: ['creator'],
  timeoutSeconds: 3600,
  timeoutAction: 'approve',
  escalateToRole: null,
  notifyChannels: ['in_app', 'email'],
  source: 'system_default',
}

const nodes = [
  createNode('agent', 'node-agent-1', '智能体一号'),
  createNode('http-tool', 'node-tool-1', 'HTTP 工具'),
  createNode('agent', 'node-agent-2', '聊天智能体'),
]

describe('InterventionPolicyTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateMutationMock.mockResolvedValue(workflowPolicy)
    createMutationMock.mockResolvedValue({
      ...workflowPolicy,
      id: 'policy-node-2',
      nodeId: 'node-agent-2',
    })
    deleteMutationMock.mockResolvedValue(undefined)
    useInterventionPoliciesMock.mockReturnValue({
      data: {
        data: [
          workflowPolicy,
          {
            id: 'policy-node-1',
            workflowId: 'wf-001',
            nodeId: 'node-agent-1',
            allowedRoles: ['creator'],
            timeoutSeconds: 3600,
            timeoutAction: 'approve',
            escalateToRole: null,
            notifyChannels: ['in_app', 'email'],
            version: 2,
          },
        ],
        meta: {
          page: 1,
          pageSize: 20,
          total: 2,
          totalPages: 1,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    })
    useResolvedInterventionPolicyMock.mockImplementation((_: string, nodeId?: string) => ({
      data: nodeId ? nodeResolvedPolicy : workflowResolvedPolicy,
      isLoading: false,
      isError: false,
      error: null,
    }))
  })

  it('展示工作流级策略摘要，并且节点选择器只包含 agent 节点', () => {
    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly={false}
      />,
    )

    expect(screen.getByText('工作流级介入策略')).toBeInTheDocument()
    expect(screen.getByText('超时：24 小时')).toBeInTheDocument()
    expect(screen.getAllByText('智能体一号').length).toBeGreaterThan(0)

    const selector = screen.getByLabelText('选择 Agent 节点') as HTMLSelectElement
    const options = Array.from(selector.options).map((option) => option.textContent)

    expect(options).toContain('智能体一号')
    expect(options).toContain('聊天智能体')
    expect(options).not.toContain('HTTP 工具')
    expect(screen.queryByText('Viewer')).not.toBeInTheDocument()
    expect(screen.getByLabelText('工作流超时时间')).toHaveAttribute('type', 'range')
    expect(screen.getByLabelText('节点超时时间')).toHaveAttribute('type', 'range')
  })

  it('超时滑块切换时会更新人类可读标签', async () => {
    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly={false}
      />,
    )

    const workflowSlider = screen.getByLabelText('工作流超时时间')

    fireEvent.change(workflowSlider, { target: { value: '8' } })

    expect(screen.getAllByText('7 天').length).toBeGreaterThan(0)
  })

  it('escalate 角色下拉只暴露 owner/admin/creator/operator', async () => {
    const user = userEvent.setup()

    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly={false}
      />,
    )

    await user.selectOptions(screen.getByLabelText('工作流超时动作'), 'escalate')

    const options = Array.from(
      screen.getByLabelText('工作流升级目标角色').querySelectorAll('option'),
    ).map((option) => option.textContent)

    expect(options).toEqual(['请选择角色', 'Owner', 'Admin', 'Creator', 'Operator'])
  })

  it('只读模式下禁用工作流与节点级保存按钮', () => {
    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly
      />,
    )

    expect(screen.getByRole('button', { name: '保存工作流策略' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存节点策略' })).toBeDisabled()
  })

  it('workflow 超时动作切到 escalate 时显示升级角色字段并进行条件校验', async () => {
    const user = userEvent.setup()

    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly={false}
      />,
    )

    await user.selectOptions(screen.getByLabelText('工作流超时动作'), 'escalate')

    expect(screen.getByLabelText('工作流升级目标角色')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存工作流策略' }))

    expect(await screen.findByText('请选择升级目标角色')).toBeInTheDocument()
    expect(updateMutationMock).not.toHaveBeenCalled()
  })

  it('保存工作流策略后展示成功反馈', async () => {
    const user = userEvent.setup()

    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly={false}
      />,
    )

    await user.selectOptions(screen.getByLabelText('工作流超时动作'), 'escalate')
    await user.selectOptions(screen.getByLabelText('工作流升级目标角色'), 'owner')
    await user.click(screen.getByRole('button', { name: '保存工作流策略' }))

    await waitFor(() => {
      expect(updateMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          policyId: 'policy-workflow',
          data: expect.objectContaining({
            timeoutAction: 'escalate',
            escalateToRole: 'owner',
            version: 5,
          }),
        }),
      )
    })

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'success',
      }),
    )
  })

  it('为没有覆盖的 agent 节点创建节点级策略', async () => {
    const user = userEvent.setup()

    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly={false}
      />,
    )

    await user.selectOptions(screen.getByLabelText('选择 Agent 节点'), 'node-agent-2')
    await user.click(screen.getByRole('button', { name: '保存节点策略' }))

    await waitFor(() => {
      expect(createMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'node-agent-2',
        }),
      )
    })

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'success',
      }),
    )
  })

  it('更新已有节点覆盖时会附带 version', async () => {
    const user = userEvent.setup()

    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: '保存节点策略' }))

    await waitFor(() => {
      expect(updateMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          policyId: 'policy-node-1',
          data: expect.objectContaining({
            version: 2,
          }),
        }),
      )
    })
  })

  it('恢复节点默认策略时调用删除接口', async () => {
    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '恢复节点默认策略' }))

    await waitFor(() => {
      expect(deleteMutationMock).toHaveBeenCalledWith('policy-node-1')
    })
  })

  it('legacy-only viewer 配置会显示兼容警告且不再回退到默认 owner/admin', async () => {
    const user = userEvent.setup()
    const legacyWorkflowPolicy = {
      ...workflowPolicy,
      allowedRoles: ['viewer'],
    }
    const legacyWorkflowResolvedPolicy = {
      ...workflowResolvedPolicy,
      allowedRoles: ['viewer'],
    }

    useInterventionPoliciesMock.mockReturnValue({
      data: {
        data: [legacyWorkflowPolicy],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    })
    useResolvedInterventionPolicyMock.mockImplementation((_: string, nodeId?: string) => ({
      data: nodeId
        ? nodeResolvedPolicy
        : legacyWorkflowResolvedPolicy,
      isLoading: false,
      isError: false,
      error: null,
    }))

    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly={false}
      />,
    )

    const workflowOwnerCheckbox = screen.getAllByLabelText('Owner')[0]
    const workflowAdminCheckbox = screen.getAllByLabelText('Admin')[0]
    if (!workflowOwnerCheckbox || !workflowAdminCheckbox) {
      throw new Error('未找到工作流级角色复选框')
    }

    expect(screen.getByTestId('workflow-legacy-role-warning')).toBeInTheDocument()
    expect(workflowOwnerCheckbox).not.toBeChecked()
    expect(workflowAdminCheckbox).not.toBeChecked()

    const saveButton = screen.getByRole('button', { name: '保存工作流策略' })
    expect(saveButton).toBeDisabled()

    await user.click(workflowOwnerCheckbox)
    expect(saveButton).toBeEnabled()

    await user.click(saveButton)

    await waitFor(() => {
      expect(updateMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          policyId: 'policy-workflow',
          data: expect.objectContaining({
            allowedRoles: ['owner'],
            version: 5,
          }),
        }),
      )
    })
  })

  it('mixed legacy roles 在用户重新选择前仍阻止保存', async () => {
    const user = userEvent.setup()
    const mixedLegacyWorkflowPolicy = {
      ...workflowPolicy,
      allowedRoles: ['owner', 'viewer'],
    }
    const mixedLegacyWorkflowResolvedPolicy = {
      ...workflowResolvedPolicy,
      allowedRoles: ['owner', 'viewer'],
    }

    useInterventionPoliciesMock.mockReturnValue({
      data: {
        data: [mixedLegacyWorkflowPolicy],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    })
    useResolvedInterventionPolicyMock.mockImplementation((_: string, nodeId?: string) => ({
      data: nodeId
        ? nodeResolvedPolicy
        : mixedLegacyWorkflowResolvedPolicy,
      isLoading: false,
      isError: false,
      error: null,
    }))

    render(
      <InterventionPolicyTab
        workflowId="wf-001"
        workflowName="Workflow One"
        nodes={nodes}
        isReadOnly={false}
      />,
    )

    const workflowOwnerCheckbox = screen.getAllByLabelText('Owner')[0]
    const workflowAdminCheckbox = screen.getAllByLabelText('Admin')[0]
    if (!workflowOwnerCheckbox || !workflowAdminCheckbox) {
      throw new Error('未找到工作流级角色复选框')
    }

    expect(screen.getByTestId('workflow-legacy-role-warning')).toBeInTheDocument()
    expect(workflowOwnerCheckbox).toBeChecked()

    const saveButton = screen.getByRole('button', { name: '保存工作流策略' })
    expect(saveButton).toBeDisabled()

    await user.click(workflowAdminCheckbox)

    expect(saveButton).toBeEnabled()
  })
})
