import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TriggerCreateDialog } from './TriggerCreateDialog'
import type { Trigger, TriggerType } from '../types'

vi.mock('@radix-ui/react-dialog', async () => {
  const React = await import('react')
  const { Fragment, createContext, useContext, cloneElement, isValidElement } = React

  const DialogContext = createContext<{
    onOpenChange?: (open: boolean) => void
  } | null>(null)

  function Root({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    children?: React.ReactNode
  }) {
    if (!open) {
      return null
    }

    return (
      <DialogContext.Provider value={{ onOpenChange }}>{children}</DialogContext.Provider>
    )
  }

  function Portal({ children }: { children?: React.ReactNode }) {
    return <Fragment>{children}</Fragment>
  }

  function Overlay(props: Record<string, unknown>) {
    return <div {...props} />
  }

  function Content(props: Record<string, unknown>) {
    return <div role="dialog" {...props} />
  }

  function Title(props: Record<string, unknown>) {
    return <h2 {...props} />
  }

  function Description(props: Record<string, unknown>) {
    return <p {...props} />
  }

  type CloseChildProps = {
    onClick?: React.MouseEventHandler
  }

  function Close({
    asChild,
    children,
  }: {
    asChild?: boolean
    children?: React.ReactNode
  }) {
    const ctx = useContext(DialogContext)

    if (asChild && isValidElement<CloseChildProps>(children)) {
      const child = children
      return cloneElement(child, {
        onClick: (event: React.MouseEvent) => {
          child.props.onClick?.(event)
          ctx?.onOpenChange?.(false)
        },
      })
    }

    return (
      <button type="button" onClick={() => ctx?.onOpenChange?.(false)}>
        {children}
      </button>
    )
  }

  return { Root, Portal, Overlay, Content, Title, Description, Close }
})

const createMutateAsyncMock = vi.fn()
const updateMutateAsyncMock = vi.fn()
const notifyMock = vi.fn()

vi.mock('../api/triggerQueries', () => ({
  useCreateTrigger: () => ({
    mutateAsync: createMutateAsyncMock,
    isPending: false,
  }),
  useUpdateTrigger: () => ({
    mutateAsync: updateMutateAsyncMock,
    isPending: false,
  }),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}))

function makeTrigger(type: TriggerType): Trigger {
  return {
    id: 'trigger-1',
    workflowDefinitionId: 'workflow-1',
    tenantId: 'tenant-1',
    name: 'Trigger',
    description: null,
    type,
    config:
      type === 'webhook'
        ? {
            token: 'token-1',
            secret: 'secret-1',
            ipWhitelist: [],
          }
        : type === 'api_event'
          ? {
              eventSource: 'order-service',
              eventType: 'order.completed',
            }
          : {
              expression: '0 9 * * 1-5',
              timezone: 'UTC',
            },
    isEnabled: true,
    lastTriggeredAt: null,
    nextFireAt: null,
    triggerCount: 0,
    createdBy: 'user-1',
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  }
}

describe('TriggerCreateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('创建 Webhook 时按当前选中的类型构造 payload', async () => {
    createMutateAsyncMock.mockResolvedValue(makeTrigger('webhook'))

    render(
      <TriggerCreateDialog
        workflowId="workflow-1"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Webhook/ }))
    fireEvent.change(screen.getByLabelText('触发器名称'), {
      target: { value: 'QA Webhook Trigger' },
    })
    fireEvent.change(screen.getByLabelText('描述'), {
      target: { value: '用于验证 Webhook UI 提交。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建触发器' }))

    await waitFor(() => {
      expect(createMutateAsyncMock).toHaveBeenCalledWith({
        type: 'webhook',
        name: 'QA Webhook Trigger',
        description: '用于验证 Webhook UI 提交。',
        isEnabled: true,
        config: {
          ipWhitelist: [],
        },
      })
    })
  })

  it('创建 API Event 时按当前选中的类型构造 payload', async () => {
    createMutateAsyncMock.mockResolvedValue(makeTrigger('api_event'))

    render(
      <TriggerCreateDialog
        workflowId="workflow-1"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /API Event/ }))
    fireEvent.change(screen.getByLabelText('触发器名称'), {
      target: { value: 'QA API Event Trigger' },
    })
    fireEvent.change(screen.getByLabelText('事件源'), {
      target: { value: 'order-service' },
    })
    fireEvent.change(screen.getByLabelText('事件类型'), {
      target: { value: 'order.completed' },
    })
    fireEvent.change(screen.getByLabelText('描述'), {
      target: { value: '用于验证 API Event UI 提交。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建触发器' }))

    await waitFor(() => {
      expect(createMutateAsyncMock).toHaveBeenCalledWith({
        type: 'api_event',
        name: 'QA API Event Trigger',
        description: '用于验证 API Event UI 提交。',
        isEnabled: true,
        config: {
          eventSource: 'order-service',
          eventType: 'order.completed',
          filterExpression: undefined,
        },
      })
    })
  })
})
