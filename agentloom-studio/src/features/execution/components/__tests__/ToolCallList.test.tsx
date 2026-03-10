import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ToolCallEventData } from '../../types'
import { ToolCallList } from '../ToolCallList'

const mocks = vi.hoisted(() => ({
  toolCalls: null as Record<string, ToolCallEventData> | null,
  submitToolPermission: vi.fn(),
}))

vi.mock('../../stores/executionStore', () => ({
  useToolCalls: () => mocks.toolCalls,
  useExecutionActions: () => ({
    submitToolPermission: (...args: unknown[]) =>
      mocks.submitToolPermission(...args),
  }),
}))

function makeToolCall(
  overrides: Partial<ToolCallEventData> & { id: string },
): ToolCallEventData {
  return {
    tool: 'test-tool',
    status: 'pending',
    ...overrides,
  }
}

const defaultProps = {
  nodeId: 'node-1',
  executionId: 'exec-1',
  stepId: 'step-1',
}

describe('ToolCallList', () => {
  beforeEach(() => {
    mocks.toolCalls = null
    mocks.submitToolPermission.mockReset()
    mocks.submitToolPermission.mockResolvedValue(undefined)
  })

  it('renders nothing when toolCalls is null', () => {
    const { container } = render(<ToolCallList {...defaultProps} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when toolCalls is empty', () => {
    mocks.toolCalls = {}
    const { container } = render(<ToolCallList {...defaultProps} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows section header "工具调用 (N)" with correct count', () => {
    mocks.toolCalls = {
      tc1: makeToolCall({ id: 'tc1', tool: 'search' }),
      tc2: makeToolCall({ id: 'tc2', tool: 'read' }),
      tc3: makeToolCall({ id: 'tc3', tool: 'write' }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.getByTestId('tool-call-list')).toBeInTheDocument()
    expect(screen.getByText('工具调用')).toBeInTheDocument()
    expect(screen.getByText('(3)')).toBeInTheDocument()
  })

  it('renders tool call card with tool name, status badge, and args', async () => {
    const user = userEvent.setup()
    mocks.toolCalls = {
      tc1: makeToolCall({
        id: 'tc1',
        tool: 'file_search',
        status: 'completed',
        args: { query: 'hello' },
      }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.getByTestId('tool-call-tc1')).toBeInTheDocument()
    expect(screen.getByText('file_search')).toBeInTheDocument()
    expect(screen.getByTestId('tool-call-status-tc1')).toHaveTextContent(
      '已完成',
    )

    await user.click(screen.getByText('参数'))
    expect(screen.getByText(/"query": "hello"/)).toBeInTheDocument()
  })

  it.each([
    ['pending', '等待中'],
    ['in_progress', '执行中'],
    ['awaiting_permission', '需要授权'],
    ['completed', '已完成'],
    ['failed', '失败'],
    ['denied', '已拒绝'],
  ] as const)('shows label "%s" as "%s"', (status, label) => {
    mocks.toolCalls = {
      tc1: makeToolCall({ id: 'tc1', status }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.getByTestId('tool-call-status-tc1')).toHaveTextContent(label)
  })

  it('calls submitToolPermission with approve on click', async () => {
    const user = userEvent.setup()
    mocks.toolCalls = {
      tc1: makeToolCall({
        id: 'tc1',
        status: 'awaiting_permission',
        tool: 'danger_tool',
      }),
    }
    render(<ToolCallList {...defaultProps} />)

    await user.click(screen.getByTestId('tool-call-approve-tc1'))

    await waitFor(() => {
      expect(mocks.submitToolPermission).toHaveBeenCalledWith(
        'exec-1',
        'step-1',
        'tc1',
        'approve',
      )
    })
  })

  it('calls submitToolPermission with deny on click', async () => {
    const user = userEvent.setup()
    mocks.toolCalls = {
      tc1: makeToolCall({
        id: 'tc1',
        status: 'awaiting_permission',
        tool: 'danger_tool',
      }),
    }
    render(<ToolCallList {...defaultProps} />)

    await user.click(screen.getByTestId('tool-call-deny-tc1'))

    await waitFor(() => {
      expect(mocks.submitToolPermission).toHaveBeenCalledWith(
        'exec-1',
        'step-1',
        'tc1',
        'deny',
      )
    })
  })

  it('disables approve/deny buttons during submission', async () => {
    const user = userEvent.setup()
    let resolvePermission!: () => void
    mocks.submitToolPermission.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePermission = resolve
        }),
    )

    mocks.toolCalls = {
      tc1: makeToolCall({
        id: 'tc1',
        status: 'awaiting_permission',
      }),
    }
    render(<ToolCallList {...defaultProps} />)

    await user.click(screen.getByTestId('tool-call-approve-tc1'))

    await waitFor(() => {
      expect(screen.getByTestId('tool-call-approve-tc1')).toBeDisabled()
      expect(screen.getByTestId('tool-call-deny-tc1')).toBeDisabled()
    })

    resolvePermission()
  })

  it.each(['pending', 'in_progress', 'completed', 'failed', 'denied'] as const)(
    'does not show approve/deny for status "%s"',
    (status) => {
      mocks.toolCalls = {
        tc1: makeToolCall({ id: 'tc1', status }),
      }
      render(<ToolCallList {...defaultProps} />)

      expect(
        screen.queryByTestId('tool-call-approve-tc1'),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('tool-call-deny-tc1'),
      ).not.toBeInTheDocument()
    },
  )

  it('shows result for completed tool call', () => {
    mocks.toolCalls = {
      tc1: makeToolCall({
        id: 'tc1',
        status: 'completed',
        result: 'File content here',
      }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.getByText('结果')).toBeInTheDocument()
    expect(screen.getByText('File content here')).toBeInTheDocument()
  })

  it('shows JSON result for completed tool call with object result', () => {
    mocks.toolCalls = {
      tc1: makeToolCall({
        id: 'tc1',
        status: 'completed',
        result: { found: true, count: 42 },
      }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.getByText('结果')).toBeInTheDocument()
    expect(screen.getByText(/"found": true/)).toBeInTheDocument()
  })

  it('shows error for failed tool call', () => {
    mocks.toolCalls = {
      tc1: makeToolCall({
        id: 'tc1',
        status: 'failed',
        error: 'Connection timeout',
      }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.getByText('错误')).toBeInTheDocument()
    expect(screen.getByText('Connection timeout')).toBeInTheDocument()
  })

  it('toggles args section open and closed', async () => {
    const user = userEvent.setup()
    mocks.toolCalls = {
      tc1: makeToolCall({
        id: 'tc1',
        args: { path: '/tmp/test.txt' },
      }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.queryByText(/"path": "\/tmp\/test.txt"/)).not.toBeInTheDocument()

    await user.click(screen.getByText('参数'))
    expect(screen.getByText(/"path": "\/tmp\/test.txt"/)).toBeInTheDocument()

    await user.click(screen.getByText('参数'))
    expect(screen.queryByText(/"path": "\/tmp\/test.txt"/)).not.toBeInTheDocument()
  })

  it('renders all tool calls in reverse order', () => {
    mocks.toolCalls = {
      tc1: makeToolCall({ id: 'tc1', tool: 'first_tool' }),
      tc2: makeToolCall({ id: 'tc2', tool: 'second_tool' }),
      tc3: makeToolCall({ id: 'tc3', tool: 'third_tool' }),
    }
    render(<ToolCallList {...defaultProps} />)

    const cards = screen.getAllByTestId(/^tool-call-tc\d$/)
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveAttribute('data-testid', 'tool-call-tc3')
    expect(cards[1]).toHaveAttribute('data-testid', 'tool-call-tc2')
    expect(cards[2]).toHaveAttribute('data-testid', 'tool-call-tc1')
  })

  it('shows permission request description for awaiting_permission', () => {
    mocks.toolCalls = {
      tc1: makeToolCall({
        id: 'tc1',
        status: 'awaiting_permission',
        permissionRequest: {
          description: '此工具需要访问文件系统',
        },
      }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.getByText('此工具需要访问文件系统')).toBeInTheDocument()
  })

  it('collapses tool call list when header is clicked', async () => {
    const user = userEvent.setup()
    mocks.toolCalls = {
      tc1: makeToolCall({ id: 'tc1', tool: 'my_tool' }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.getByTestId('tool-call-tc1')).toBeInTheDocument()

    await user.click(screen.getByText('工具调用'))
    expect(screen.queryByTestId('tool-call-tc1')).not.toBeInTheDocument()

    await user.click(screen.getByText('工具调用'))
    expect(screen.getByTestId('tool-call-tc1')).toBeInTheDocument()
  })

  it('does not show args toggle when args is empty', () => {
    mocks.toolCalls = {
      tc1: makeToolCall({ id: 'tc1', args: {} }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.queryByText('参数')).not.toBeInTheDocument()
  })

  it('does not show result for non-terminal status even if result exists', () => {
    mocks.toolCalls = {
      tc1: makeToolCall({
        id: 'tc1',
        status: 'in_progress',
        result: 'should not show',
      }),
    }
    render(<ToolCallList {...defaultProps} />)

    expect(screen.queryByText('结果')).not.toBeInTheDocument()
    expect(screen.queryByText('should not show')).not.toBeInTheDocument()
  })
})
