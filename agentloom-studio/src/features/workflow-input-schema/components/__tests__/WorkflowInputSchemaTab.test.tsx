import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowInputSchema } from '@/features/workflow/types'
import { WorkflowInputSchemaTab } from '../WorkflowInputSchemaTab'

const mutateAsyncMock = vi.fn()
const notifyMock = vi.fn()

vi.mock('@/features/workflow/api/workflowMutations', () => ({
  useUpdateWorkflow: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

describe('WorkflowInputSchemaTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('编辑字段后保存 input schema', async () => {
    const inputSchema: WorkflowInputSchema = {
      version: 1,
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

    mutateAsyncMock.mockResolvedValue({
      version: 8,
      inputSchema: {
        ...inputSchema,
        version: 2,
        fields: [
          {
            ...inputSchema.fields[0],
            label: '审批主题',
          },
        ],
      },
    })

    render(
      <WorkflowInputSchemaTab
        workflowId="wf-001"
        workflowVersion={7}
        inputSchema={inputSchema}
        isReadOnly={false}
      />,
    )

    fireEvent.change(screen.getByTestId('input-schema-field-label-0'), {
      target: { value: '审批主题' },
    })
    fireEvent.click(screen.getByTestId('save-input-schema'))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        version: 7,
        inputSchema: {
          version: 1,
          collectionMode: 'form',
          fields: [
            {
              id: 'topic',
              type: 'text',
              label: '审批主题',
              required: true,
            },
          ],
        },
      })
    })

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '输入参数已保存',
      }),
    )
  })

  it('保存条件字段时将 number visibility 等于值规范为数字', async () => {
    const inputSchema: WorkflowInputSchema = {
      version: 1,
      collectionMode: 'form',
      fields: [
        {
          id: 'age',
          type: 'number',
          label: '年龄',
          required: true,
        },
      ],
    }

    mutateAsyncMock.mockResolvedValue({
      version: 4,
      inputSchema: {
        ...inputSchema,
        version: 2,
      },
    })

    render(
      <WorkflowInputSchemaTab
        workflowId="wf-001"
        workflowVersion={3}
        inputSchema={inputSchema}
        isReadOnly={false}
      />,
    )

    fireEvent.click(screen.getByTestId('add-input-schema-field'))
    fireEvent.change(screen.getByTestId('input-schema-field-id-1'), {
      target: { value: 'guardian' },
    })
    fireEvent.change(screen.getByTestId('input-schema-field-label-1'), {
      target: { value: '监护人姓名' },
    })
    fireEvent.change(screen.getByTestId('input-schema-visibility-field-1'), {
      target: { value: 'age' },
    })
    fireEvent.change(screen.getByTestId('input-schema-visibility-equals-1'), {
      target: { value: '18' },
    })
    fireEvent.click(screen.getByTestId('save-input-schema'))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 3,
          inputSchema: expect.objectContaining({
            fields: [
              inputSchema.fields[0],
              expect.objectContaining({
                id: 'guardian',
                label: '监护人姓名',
                visibility: {
                  fieldId: 'age',
                  equals: 18,
                },
              }),
            ],
          }),
        }),
      )
    })
  })

  it('支持字段重排并按新顺序保存 canonical schema', async () => {
    const inputSchema: WorkflowInputSchema = {
      version: 1,
      collectionMode: 'form',
      fields: [
        {
          id: 'topic',
          type: 'text',
          label: '主题',
          required: true,
        },
        {
          id: 'priority',
          type: 'single_select',
          label: '优先级',
          required: false,
          options: ['high', 'low'],
        },
      ],
    }

    mutateAsyncMock.mockResolvedValue({
      version: 6,
      inputSchema: {
        ...inputSchema,
        version: 2,
        fields: [inputSchema.fields[1], inputSchema.fields[0]],
      },
    })

    render(
      <WorkflowInputSchemaTab
        workflowId="wf-001"
        workflowVersion={5}
        inputSchema={inputSchema}
        isReadOnly={false}
      />,
    )

    fireEvent.click(screen.getByTestId('move-input-schema-field-down-0'))
    fireEvent.click(screen.getByTestId('save-input-schema'))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        version: 5,
        inputSchema: {
          version: 1,
          collectionMode: 'form',
          fields: [inputSchema.fields[1], inputSchema.fields[0]],
        },
      })
    })
  })

  it('在预览区复用同一 canonical renderer，并按条件显示字段', () => {
    const inputSchema: WorkflowInputSchema = {
      version: 1,
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

    render(
      <WorkflowInputSchemaTab
        workflowId="wf-001"
        workflowVersion={3}
        inputSchema={inputSchema}
        isReadOnly={false}
      />,
    )

    expect(screen.getByText('表单预览')).toBeInTheDocument()
    expect(screen.queryByLabelText('阈值')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('运行模式'), {
      target: { value: 'advanced' },
    })

    expect(screen.getByLabelText('阈值')).toBeInTheDocument()
  })

  it('渲染收集模式切换器，并允许切换到对话模式', () => {
    const inputSchema: WorkflowInputSchema = {
      version: 1,
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

    render(
      <WorkflowInputSchemaTab
        workflowId="wf-001"
        workflowVersion={3}
        inputSchema={inputSchema}
        isReadOnly={false}
      />,
    )

    fireEvent.change(screen.getByTestId('input-schema-collection-mode'), {
      target: { value: 'conversation' },
    })

    expect(screen.getByLabelText('系统提示词')).toBeInTheDocument()
    expect(screen.getByLabelText('最大轮次')).toBeInTheDocument()
  })

  it('对话模式渲染 conversation plan 编辑器', () => {
    const inputSchema: WorkflowInputSchema = {
      version: 2,
      collectionMode: 'conversation',
      conversationPlan: {
        systemPrompt: '请逐步引导用户补全信息。',
        maxTurns: 8,
      },
      fields: [
        {
          id: 'goal',
          type: 'text',
          label: '目标',
          required: true,
        },
      ],
    }

    render(
      <WorkflowInputSchemaTab
        workflowId="wf-001"
        workflowVersion={5}
        inputSchema={inputSchema}
        isReadOnly={false}
      />,
    )

    expect(screen.getByLabelText('系统提示词')).toHaveValue('请逐步引导用户补全信息。')
    expect(screen.getByLabelText('最大轮次')).toHaveValue(8)
  })

  it('保存 conversation plan 变更', async () => {
    const inputSchema: WorkflowInputSchema = {
      version: 2,
      collectionMode: 'conversation',
      conversationPlan: {
        systemPrompt: '请逐步引导用户补全信息。',
        maxTurns: 8,
      },
      fields: [
        {
          id: 'goal',
          type: 'text',
          label: '目标',
          required: true,
        },
      ],
    }

    mutateAsyncMock.mockResolvedValue({
      version: 9,
      inputSchema: {
        ...inputSchema,
        version: 3,
        conversationPlan: {
          systemPrompt: '请先确认背景，再逐项追问。',
          maxTurns: 12,
        },
      },
    })

    render(
      <WorkflowInputSchemaTab
        workflowId="wf-001"
        workflowVersion={8}
        inputSchema={inputSchema}
        isReadOnly={false}
      />,
    )

    fireEvent.change(screen.getByLabelText('系统提示词'), {
      target: { value: '请先确认背景，再逐项追问。' },
    })
    fireEvent.change(screen.getByLabelText('最大轮次'), {
      target: { value: '12' },
    })
    fireEvent.click(screen.getByTestId('save-input-schema'))

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        version: 8,
        inputSchema: {
          version: 2,
          collectionMode: 'conversation',
          conversationPlan: {
            systemPrompt: '请先确认背景，再逐项追问。',
            maxTurns: 12,
          },
          fields: [
            {
              id: 'goal',
              type: 'text',
              label: '目标',
              required: true,
            },
          ],
        },
      })
    })
  })

  it('字段编辑器渲染 collectionHint 输入框', () => {
    const inputSchema: WorkflowInputSchema = {
      version: 1,
      collectionMode: 'form',
      fields: [
        {
          id: 'topic',
          type: 'text',
          label: '主题',
          required: true,
          collectionHint: '先让用户说明受众和输出目标。',
        },
      ],
    }

    render(
      <WorkflowInputSchemaTab
        workflowId="wf-001"
        workflowVersion={3}
        inputSchema={inputSchema}
        isReadOnly={false}
      />,
    )

    expect(screen.getByTestId('input-schema-field-collection-hint-0')).toHaveValue(
      '先让用户说明受众和输出目标。',
    )
  })

  it('hybrid 模式同时展示字段编辑器与 conversation plan', () => {
    const inputSchema: WorkflowInputSchema = {
      version: 3,
      collectionMode: 'hybrid',
      conversationPlan: {
        systemPrompt: '先收集可结构化字段，再追问剩余信息。',
        maxTurns: 6,
      },
      fields: [
        {
          id: 'topic',
          type: 'text',
          label: '主题',
          required: true,
          collectionHint: '若用户未直接给出主题，先追问业务背景。',
        },
      ],
    }

    render(
      <WorkflowInputSchemaTab
        workflowId="wf-001"
        workflowVersion={4}
        inputSchema={inputSchema}
        isReadOnly={false}
      />,
    )

    expect(screen.getByLabelText('系统提示词')).toBeInTheDocument()
    expect(screen.getByTestId('input-schema-field-label-0')).toBeInTheDocument()
    expect(screen.getByTestId('input-schema-field-collection-hint-0')).toBeInTheDocument()
    expect(screen.getByTestId('workflow-input-schema-preview')).toBeInTheDocument()
  })

  it('viewer/operator 只读时禁用编辑与保存', () => {
    const inputSchema: WorkflowInputSchema = {
      version: 1,
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

    render(
      <WorkflowInputSchemaTab
        workflowId="wf-001"
        workflowVersion={3}
        inputSchema={inputSchema}
        isReadOnly
      />,
    )

    expect(screen.getByText('当前角色仅可查看输入参数配置，无法编辑或保存。')).toBeInTheDocument()
    expect(screen.getByTestId('add-input-schema-field')).toBeDisabled()
    expect(screen.getByTestId('save-input-schema')).toBeDisabled()
    expect(screen.getByTestId('input-schema-field-label-0')).toBeDisabled()
    expect(screen.getByLabelText('主题')).toBeDisabled()

    fireEvent.click(screen.getByTestId('save-input-schema'))
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })
})
