import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BlockCreateDialog } from './BlockCreateDialog'
import type { EncapsulationAnalysis } from '../lib/encapsulation'

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
    const onOpenChange = useContext(DialogContext)?.onOpenChange

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
      { type: 'button', onClick: () => onOpenChange?.(false) },
      children,
    )
  }

  return { Root, Portal, Overlay, Content, Title, Description, Close }
})

function makeAnalysis(): EncapsulationAnalysis {
  return {
    selectedNodes: [],
    selectedEdges: [],
    incomingEdges: [],
    outgoingEdges: [],
    inputPorts: [
      {
        id: 'input-port-1',
        label: '输入上下文',
        dataType: 'json',
        sourceNodeId: 'node-a',
        sourcePortId: 'context',
      },
    ],
    outputPorts: [
      {
        id: 'output-port-1',
        label: '处理结果',
        dataType: 'text',
        sourceNodeId: 'node-b',
        sourcePortId: 'result',
      },
    ],
    centroid: { x: 200, y: 300 },
  }
}

describe('BlockCreateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form fields correctly', () => {
    render(
      <BlockCreateDialog
        open={true}
        onOpenChange={vi.fn()}
        analysis={makeAnalysis()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('块名称')).toBeInTheDocument()
    expect(screen.getByLabelText('描述')).toBeInTheDocument()
    expect(screen.getByLabelText('分类')).toBeInTheDocument()
    expect(screen.getByLabelText('标签')).toBeInTheDocument()
    expect(screen.getByText('创建可复用块')).toBeInTheDocument()
  })

  it('validates that block name is required', async () => {
    const user = userEvent.setup()

    render(
      <BlockCreateDialog
        open={true}
        onOpenChange={vi.fn()}
        analysis={makeAnalysis()}
        onConfirm={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '确认创建' }))

    await waitFor(() => {
      expect(screen.getByText('请输入块名称')).toBeInTheDocument()
    })
  })

  it('shows derived input and output ports for editing', () => {
    render(
      <BlockCreateDialog
        open={true}
        onOpenChange={vi.fn()}
        analysis={makeAnalysis()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('输入端口')).toBeInTheDocument()
    expect(screen.getByText('输出端口')).toBeInTheDocument()
    expect(screen.getByDisplayValue('输入上下文')).toBeInTheDocument()
    expect(screen.getByDisplayValue('处理结果')).toBeInTheDocument()
    expect(screen.getByText('json')).toBeInTheDocument()
    expect(screen.getByText('text')).toBeInTheDocument()
  })

  it('calls onConfirm with normalized tags and edited port labels on submit', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <BlockCreateDialog
        open={true}
        onOpenChange={vi.fn()}
        analysis={makeAnalysis()}
        onConfirm={onConfirm}
      />,
    )

    await user.type(screen.getByLabelText('块名称'), '分析块')
    await user.type(screen.getByLabelText('描述'), '封装内部分析流程')
    await user.click(screen.getByLabelText('分类'))
    await user.click(await screen.findByRole('option', { name: '开发' }))
    await user.type(screen.getByLabelText('标签'), 'alpha, beta , , gamma')

    const inputPortLabel = screen.getByTestId('block-input-port-label-input-port-1')
    const outputPortLabel = screen.getByTestId('block-output-port-label-output-port-1')

    await user.clear(inputPortLabel)
    await user.type(inputPortLabel, '请求上下文')
    await user.clear(outputPortLabel)
    await user.type(outputPortLabel, '文本摘要')

    await user.click(screen.getByRole('button', { name: '确认创建' }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        name: '分析块',
        description: '封装内部分析流程',
        category: 'development',
        tags: ['alpha', 'beta', 'gamma'],
        inputPorts: [
          {
            id: 'input-port-1',
            label: '请求上下文',
            dataType: 'json',
            sourceNodeId: 'node-a',
            sourcePortId: 'context',
          },
        ],
        outputPorts: [
          {
            id: 'output-port-1',
            label: '文本摘要',
            dataType: 'text',
            sourceNodeId: 'node-b',
            sourcePortId: 'result',
          },
        ],
      })
    })
  })
})
