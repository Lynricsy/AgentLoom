import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowInputSchema } from '@/features/workflow/types'
import { ExecutionLaunchDialog } from '../ExecutionLaunchDialog'

vi.mock('@radix-ui/react-dialog', async () => {
  const React = await import('react')
  const { Fragment, createContext, useContext, cloneElement, isValidElement } = React

  const DialogContext = createContext<{ onOpenChange?: (open: boolean) => void } | null>(null)

  function Root({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    children?: React.ReactNode
  }) {
    if (!open) return null
    return React.createElement(DialogContext.Provider, { value: { onOpenChange } }, children)
  }

  function Portal({ children }: { children?: React.ReactNode }) {
    return React.createElement(Fragment, null, children)
  }

  function Overlay(props: Record<string, unknown>) {
    return React.createElement('div', props)
  }

  function Content(props: Record<string, unknown>) {
    return React.createElement('div', { role: 'dialog', ...props })
  }

  function Title(props: Record<string, unknown>) {
    return React.createElement('h2', props)
  }

  function Description(props: Record<string, unknown>) {
    return React.createElement('p', props)
  }

  function Close({
    asChild,
    children,
  }: {
    asChild?: boolean
    children?: React.ReactNode
  }) {
    const ctx = useContext(DialogContext)
    const onOpenChange = ctx?.onOpenChange

    type CloseChildProps = {
      onClick?: React.MouseEventHandler
    }

    if (asChild && isValidElement<CloseChildProps>(children)) {
      const child = children
      return cloneElement(child, {
        onClick: (event: React.MouseEvent) => {
          child.props.onClick?.(event)
          onOpenChange?.(false)
        },
      })
    }

    return React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => onOpenChange?.(false),
      },
      children,
    )
  }

  return {
    Root,
    Portal,
    Overlay,
    Content,
    Title,
    Description,
    Close,
  }
})

/**
 * 用 fireEvent 驱动 Radix Select：trigger 未收到 pointerdown 时按非鼠标指针处理，
 * click 即可展开面板；option 同理，直接 click 就会触发选中。
 */
function chooseRadixOption(trigger: HTMLElement, optionName: string) {
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('option', { name: optionName }))
}

const useWorkflowInputSchemaMock = vi.fn()
const startExecutionMock = vi.fn()
const notifyMock = vi.fn()

vi.mock('@/features/workflow/api/workflowQueries', () => ({
  useWorkflowInputSchema: (...args: unknown[]) => useWorkflowInputSchemaMock(...args),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

describe('ExecutionLaunchDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorkflowInputSchemaMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    startExecutionMock.mockResolvedValue({ id: 'exec-001' })
  })

  it('发布态使用 published input schema，并按可见字段提交 launch payload', async () => {
    const inputSchema: WorkflowInputSchema = {
      version: 3,
      collectionMode: 'form',
      fields: [
        {
          id: 'mode',
          type: 'single_select',
          label: '运行模式',
          required: true,
          options: ['basic', 'advanced'],
          default: 'basic',
        },
        {
          id: 'threshold',
          type: 'number',
          label: '阈值',
          required: true,
          visibility: {
            fieldId: 'mode',
            equals: 'advanced',
          },
        },
      ],
    }

    useWorkflowInputSchemaMock.mockReturnValue({
      data: inputSchema,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    const onOpenChange = vi.fn()

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={onOpenChange}
      />,
    )

    expect(useWorkflowInputSchemaMock).toHaveBeenCalledWith('wf-001', { enabled: true })
    expect(screen.queryByLabelText('阈值')).not.toBeInTheDocument()

    chooseRadixOption(screen.getByLabelText('运行模式'), 'advanced')

    expect(screen.getByLabelText('阈值')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('阈值'), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByTestId('confirm-launch-workflow'))

    await waitFor(() => {
      expect(startExecutionMock).toHaveBeenCalledWith('wf-001', {
        inputParams: {
          mode: 'advanced',
          threshold: 10,
        },
        schemaVersion: 3,
        launchSource: 'web-studio',
      })
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('编辑器要求使用草稿 schema 时，发布态也应优先使用 draftInputSchema', async () => {
    const draftInputSchema: WorkflowInputSchema = {
      version: 7,
      collectionMode: 'form',
      fields: [
        {
          id: 'topic',
          type: 'text',
          label: '主题',
          required: true,
        },
      ],
    }

    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 3,
        collectionMode: 'form',
        fields: [
          {
            id: 'mode',
            type: 'single_select',
            label: '运行模式',
            required: true,
            options: ['basic', 'advanced'],
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={draftInputSchema}
        preferDraftSchema
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
      />,
    )

    expect(useWorkflowInputSchemaMock).toHaveBeenCalledWith('wf-001', { enabled: false })
    expect(screen.getByText(/本次运行将使用当前编辑稿/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('主题'), {
      target: { value: 'Bark 验证' },
    })
    fireEvent.click(screen.getByTestId('confirm-launch-workflow'))

    await waitFor(() => {
      expect(startExecutionMock).toHaveBeenCalledWith('wf-001', {
        inputParams: {
          topic: 'Bark 验证',
        },
        schemaVersion: 7,
        launchSource: 'web-studio',
      })
    })
  })

  it('草稿态优先使用 draftInputSchema，且不会启用 published 查询', async () => {
    const draftInputSchema: WorkflowInputSchema = {
      version: 2,
      collectionMode: 'form',
      fields: [
        {
          id: 'topic',
          type: 'text',
          label: '主题',
          required: true,
        },
      ],
    }

    const onOpenChange = vi.fn()

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="draft"
        draftInputSchema={draftInputSchema}
        onStartExecution={startExecutionMock}
        onOpenChange={onOpenChange}
      />,
    )

    expect(useWorkflowInputSchemaMock).toHaveBeenCalledWith('wf-001', { enabled: false })

    fireEvent.change(screen.getByLabelText('主题'), {
      target: { value: '周报' },
    })
    fireEvent.click(screen.getByTestId('confirm-launch-workflow'))

    await waitFor(() => {
      expect(startExecutionMock).toHaveBeenCalledWith('wf-001', {
        inputParams: { topic: '周报' },
        schemaVersion: 2,
        launchSource: 'web-studio',
      })
    })
  })

  it('字段重新隐藏后会在提交前排除旧值', async () => {
    const inputSchema: WorkflowInputSchema = {
      version: 4,
      collectionMode: 'form',
      fields: [
        {
          id: 'mode',
          type: 'single_select',
          label: '运行模式',
          required: true,
          options: ['basic', 'advanced'],
          default: 'basic',
        },
        {
          id: 'threshold',
          type: 'number',
          label: '阈值',
          required: true,
          visibility: {
            fieldId: 'mode',
            equals: 'advanced',
          },
        },
      ],
    }

    useWorkflowInputSchemaMock.mockReturnValue({
      data: inputSchema,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
      />,
    )

    chooseRadixOption(screen.getByLabelText('运行模式'), 'advanced')
    fireEvent.change(screen.getByLabelText('阈值'), {
      target: { value: '10' },
    })
    chooseRadixOption(screen.getByLabelText('运行模式'), 'basic')

    expect(screen.queryByLabelText('阈值')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('confirm-launch-workflow'))

    await waitFor(() => {
      expect(startExecutionMock).toHaveBeenCalledWith('wf-001', {
        inputParams: { mode: 'basic' },
        schemaVersion: 4,
        launchSource: 'web-studio',
      })
    })
  })

  it('没有可见字段时仍支持确认后直接启动', async () => {
    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 6,
        collectionMode: 'form',
        fields: [],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText('当前工作流没有需要填写的字段，确认后将直接启动执行。')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('confirm-launch-workflow'))

    await waitFor(() => {
      expect(startExecutionMock).toHaveBeenCalledWith('wf-001', {
        inputParams: {},
        schemaVersion: 6,
        launchSource: 'web-studio',
      })
    })
  })

  it('对话模式渲染会话壳，并展示 systemPrompt', () => {
    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 5,
        collectionMode: 'conversation',
        conversationPlan: {
          systemPrompt: '请像助理一样逐项确认输入参数。',
          maxTurns: 6,
        },
        fields: [
          {
            id: 'goal',
            type: 'text',
            label: '目标',
            required: true,
            collectionHint: '优先确认交付物和受众。',
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
        />,
      )

    expect(screen.getByTestId('launch-conversation-shell')).toBeInTheDocument()
    expect(screen.getByText('请像助理一样逐项确认输入参数。')).toBeInTheDocument()
    expect(screen.getByText('目标')).toBeInTheDocument()
    expect(screen.getByTestId('launch-conversation-shell')).toHaveTextContent('已使用 0/6 轮。')
  })

  it('hybrid 模式先渲染表单阶段', () => {
    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 7,
        collectionMode: 'hybrid',
        conversationPlan: {
          systemPrompt: '先通过表单拿到已知信息，再追问缺口。',
          maxTurns: 5,
        },
        fields: [
          {
            id: 'topic',
            type: 'text',
            label: '主题',
            required: true,
          },
          {
            id: 'tone',
            type: 'text',
            label: '语气',
            required: true,
            collectionHint: '若无法直接确认，请通过对话追问风格偏好。',
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText('步骤 1：表单补充')).toBeInTheDocument()
    expect(screen.getByLabelText('主题')).toBeInTheDocument()
    expect(screen.queryByTestId('launch-conversation-shell')).not.toBeInTheDocument()
  })

  it('hybrid 模式支持在表单与对话阶段之间切换', () => {
    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 7,
        collectionMode: 'hybrid',
        conversationPlan: {
          systemPrompt: '先通过表单拿到已知信息，再追问缺口。',
          maxTurns: 5,
        },
        fields: [
          {
            id: 'topic',
            type: 'text',
            label: '主题',
            required: true,
          },
          {
            id: 'tone',
            type: 'text',
            label: '语气',
            required: true,
            collectionHint: '若无法直接确认，请通过对话追问风格偏好。',
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('launch-dialog-next-stage'))

    expect(screen.getByText('步骤 2：对话补充')).toBeInTheDocument()
    expect(screen.getByTestId('launch-conversation-shell')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('launch-dialog-back-stage'))

    expect(screen.getByText('步骤 1：表单补充')).toBeInTheDocument()
  })

  it('对话模式在最终提交前展示结果摘要', async () => {
    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 5,
        collectionMode: 'conversation',
        conversationPlan: {
          systemPrompt: '请像助理一样逐项确认输入参数。',
          maxTurns: 6,
        },
        fields: [
          {
            id: 'goal',
            type: 'text',
            label: '目标',
            required: true,
            collectionHint: '优先确认交付物和受众。',
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('回复内容'), {
      target: { value: '输出一份市场周报' },
    })
    fireEvent.click(screen.getByTestId('launch-conversation-send'))

    expect(await screen.findByText('确认运行参数')).toBeInTheDocument()
    expect(screen.getByDisplayValue('输出一份市场周报')).toBeInTheDocument()
    expect(startExecutionMock).not.toHaveBeenCalled()
  })

  it('对话模式按正确 payload 提交', async () => {
    renderConversationModeDialog()

    fireEvent.change(screen.getByLabelText('回复内容'), {
      target: { value: '输出一份市场周报' },
    })
    fireEvent.click(screen.getByTestId('launch-conversation-send'))

    expect(await screen.findByText('确认运行参数')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('confirm-launch-workflow'))

    await waitFor(() => {
      expect(startExecutionMock).toHaveBeenCalledWith('wf-001', {
        inputParams: { goal: '输出一份市场周报' },
        schemaVersion: 5,
        launchSource: 'web-studio',
      })
    })
  })

  it('对话模式达到最大轮次后会进入摘要页并要求手动补齐剩余字段', async () => {
    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 6,
        collectionMode: 'conversation',
        conversationPlan: {
          systemPrompt: '按顺序收集参数。',
          maxTurns: 1,
        },
        fields: [
          {
            id: 'goal',
            type: 'text',
            label: '目标',
            required: true,
          },
          {
            id: 'audience',
            type: 'text',
            label: '受众',
            required: true,
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('回复内容'), {
      target: { value: '输出一份市场周报' },
    })
    fireEvent.click(screen.getByTestId('launch-conversation-send'))

    expect(await screen.findByTestId('launch-conversation-limit-notice')).toHaveTextContent(
      '剩余 1 个字段',
    )
    expect(screen.getByLabelText('受众')).toBeInTheDocument()
    expect(startExecutionMock).not.toHaveBeenCalled()
  })

  it('对话模式支持使用 Enter 提交当前回复', async () => {
    renderConversationModeDialog()

    fireEvent.change(screen.getByLabelText('回复内容'), {
      target: { value: '输出一份市场周报' },
    })
    fireEvent.keyDown(screen.getByLabelText('回复内容'), {
      key: 'Enter',
      code: 'Enter',
      charCode: 13,
    })

    expect(await screen.findByText('确认运行参数')).toBeInTheDocument()
  })

  it('对话模式在 IME 组合输入期间不会把 Enter 当作提交', async () => {
    renderConversationModeDialog()

    fireEvent.change(screen.getByLabelText('回复内容'), {
      target: { value: '输出一份市场周报' },
    })
    fireEvent.keyDown(screen.getByLabelText('回复内容'), {
      key: 'Enter',
      code: 'Enter',
      charCode: 13,
      isComposing: true,
    })

    expect(screen.queryByText('确认运行参数')).not.toBeInTheDocument()
    expect(startExecutionMock).not.toHaveBeenCalled()
  })

  it('对话模式会拒绝 single_select 的非法选项', async () => {
    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 7,
        collectionMode: 'conversation',
        conversationPlan: {
          systemPrompt: '请选择一个合法模式。',
          maxTurns: 3,
        },
        fields: [
          {
            id: 'mode',
            type: 'single_select',
            label: '模式',
            required: true,
            options: ['basic', 'advanced'],
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('launch-conversation-shell')).toHaveTextContent(
      '可选值：basic、advanced',
    )

    fireEvent.change(screen.getByLabelText('回复内容'), {
      target: { value: 'invalid-mode' },
    })
    fireEvent.click(screen.getByTestId('launch-conversation-send'))

    expect(await screen.findByText('模式必须选择预定义选项')).toBeInTheDocument()
    expect(startExecutionMock).not.toHaveBeenCalled()
  })

  it('对话模式会拒绝 multi_select 的非法选项', async () => {
    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 8,
        collectionMode: 'conversation',
        conversationPlan: {
          systemPrompt: '请选择合法标签。',
          maxTurns: 3,
        },
        fields: [
          {
            id: 'tags',
            type: 'multi_select',
            label: '标签',
            required: true,
            options: ['report', 'brief'],
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('回复内容'), {
      target: { value: 'report, unknown' },
    })
    fireEvent.click(screen.getByTestId('launch-conversation-send'))

    expect(await screen.findByText('标签只能包含预定义选项')).toBeInTheDocument()
    expect(startExecutionMock).not.toHaveBeenCalled()
  })

  it('hybrid 模式按正确 payload 提交合并后的表单与对话值', async () => {
    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 7,
        collectionMode: 'hybrid',
        conversationPlan: {
          systemPrompt: '先通过表单拿到已知信息，再追问缺口。',
          maxTurns: 5,
        },
        fields: [
          {
            id: 'topic',
            type: 'text',
            label: '主题',
            required: true,
          },
          {
            id: 'tone',
            type: 'text',
            label: '语气',
            required: true,
            collectionHint: '若无法直接确认，请通过对话追问风格偏好。',
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <ExecutionLaunchDialog
        open
        workflowId="wf-001"
        workflowName="Workflow One"
        workflowStatus="published"
        draftInputSchema={null}
        onStartExecution={startExecutionMock}
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('主题'), {
      target: { value: '行业周报' },
    })
    fireEvent.click(screen.getByTestId('launch-dialog-next-stage'))

    fireEvent.change(screen.getByLabelText('回复内容'), {
      target: { value: '正式专业' },
    })
    fireEvent.click(screen.getByTestId('launch-conversation-send'))

    expect(await screen.findByText('确认运行参数')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('confirm-launch-workflow'))

    await waitFor(() => {
      expect(startExecutionMock).toHaveBeenCalledWith('wf-001', {
        inputParams: {
          topic: '行业周报',
          tone: '正式专业',
        },
        schemaVersion: 7,
        launchSource: 'web-studio',
      })
    })
  })
})

function renderConversationModeDialog() {
  useWorkflowInputSchemaMock.mockReturnValue({
    data: {
      version: 5,
      collectionMode: 'conversation',
      conversationPlan: {
        systemPrompt: '请像助理一样逐项确认输入参数。',
        maxTurns: 6,
      },
      fields: [
        {
          id: 'goal',
          type: 'text',
          label: '目标',
          required: true,
          collectionHint: '优先确认交付物和受众。',
        },
      ],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })

  render(
    <ExecutionLaunchDialog
      open
      workflowId="wf-001"
      workflowName="Workflow One"
      workflowStatus="published"
      draftInputSchema={null}
      onStartExecution={startExecutionMock}
      onOpenChange={vi.fn()}
    />,
  )
}
