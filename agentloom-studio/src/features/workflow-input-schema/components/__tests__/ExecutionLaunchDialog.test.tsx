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

    fireEvent.change(screen.getByLabelText('运行模式'), {
      target: { value: 'advanced' },
    })

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

    fireEvent.change(screen.getByLabelText('运行模式'), {
      target: { value: 'advanced' },
    })
    fireEvent.change(screen.getByLabelText('阈值'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('运行模式'), {
      target: { value: 'basic' },
    })

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

  it('非 form collectionMode 时显示不支持提示并禁用启动', () => {
    useWorkflowInputSchemaMock.mockReturnValue({
      data: {
        version: 5,
        collectionMode: 'conversation',
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

    expect(screen.getByText('当前 Web Studio 仅支持表单模式启动。')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-launch-workflow')).toBeDisabled()
  })
})
