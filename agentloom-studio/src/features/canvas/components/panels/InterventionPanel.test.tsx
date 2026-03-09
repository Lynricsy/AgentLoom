import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InterventionPanel } from './InterventionPanel'

const mocks = vi.hoisted(() => ({
  intervention: null as {
    decision?: {
      suggestedContent?: string
      confidence?: number
      rationale?: string
    }
    partialContent?: string
  } | null,
  nodeState: null as {
    stepId: string
    nodeId: string
    status: string
    output: string
    isStreaming: boolean
  } | null,
  executionId: 'exec-1' as string | null,
  resolveIntervention: vi.fn(),
}))

vi.mock('@/features/execution/stores/executionStore', () => ({
  useNodeIntervention: () => mocks.intervention,
  useNodeExecutionState: () => mocks.nodeState,
  useExecutionId: () => mocks.executionId,
  useExecutionActions: () => ({
    submitIntervention: (...args: unknown[]) => mocks.resolveIntervention(...args),
  }),
}))

vi.mock('@/features/execution/api/executionApi', () => ({
  resolveIntervention: (...args: unknown[]) =>
    mocks.resolveIntervention(...args),
}))

describe('InterventionPanel', () => {
  beforeEach(() => {
    mocks.intervention = {
      decision: {
        suggestedContent: '建议的内容',
        confidence: 0.85,
        rationale: '基于上下文分析',
      },
    }
    mocks.nodeState = {
      stepId: 'step-1',
      nodeId: 'node-1',
      status: 'waiting_intervention',
      output: '',
      isStreaming: false,
    }
    mocks.executionId = 'exec-1'
    mocks.resolveIntervention.mockReset()
    mocks.resolveIntervention.mockResolvedValue({
      data: {
        executionId: 'exec-1',
        stepId: 'step-1',
        status: 'intervention_accepted',
      },
    })
  })

  it('does not render when intervention is null', () => {
    mocks.intervention = null
    render(<InterventionPanel nodeId="node-1" />)
    expect(
      screen.queryByTestId('intervention-panel'),
    ).not.toBeInTheDocument()
  })

  it('does not render when status is not waiting_intervention', () => {
    mocks.nodeState = { ...mocks.nodeState!, status: 'running' }
    render(<InterventionPanel nodeId="node-1" />)
    expect(
      screen.queryByTestId('intervention-panel'),
    ).not.toBeInTheDocument()
  })

  it('does not render when executionId is null', () => {
    mocks.executionId = null
    render(<InterventionPanel nodeId="node-1" />)
    expect(
      screen.queryByTestId('intervention-panel'),
    ).not.toBeInTheDocument()
  })

  it('renders decision details when intervention is active', () => {
    render(<InterventionPanel nodeId="node-1" />)

    expect(screen.getByTestId('intervention-panel')).toBeInTheDocument()
    expect(screen.getByText('需要人工干预')).toBeInTheDocument()
    expect(screen.getByText('基于上下文分析')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('建议的内容')).toBeInTheDocument()
  })

  it('renders three action buttons in idle mode', () => {
    render(<InterventionPanel nodeId="node-1" />)

    expect(screen.getByTestId('intervention-approve')).toBeInTheDocument()
    expect(screen.getByTestId('intervention-modify')).toBeInTheDocument()
    expect(screen.getByTestId('intervention-reject')).toBeInTheDocument()
  })

  it('calls resolveIntervention with approve action', async () => {
    const user = userEvent.setup()
    render(<InterventionPanel nodeId="node-1" />)

    await user.click(screen.getByTestId('intervention-approve'))

    await waitFor(() => {
      expect(mocks.resolveIntervention).toHaveBeenCalledWith(
        'exec-1',
        'step-1',
        { action: 'approve' },
      )
    })
  })

  it('shows modify form with prefilled content and submits', async () => {
    const user = userEvent.setup()
    render(<InterventionPanel nodeId="node-1" />)

    await user.click(screen.getByTestId('intervention-modify'))

    const textarea = screen.getByTestId('intervention-modified-content')
    expect(textarea).toHaveValue('建议的内容')

    await user.clear(textarea)
    await user.type(textarea, '修改后的内容')

    await user.click(screen.getByTestId('intervention-submit-modify'))

    await waitFor(() => {
      expect(mocks.resolveIntervention).toHaveBeenCalledWith(
        'exec-1',
        'step-1',
        {
          action: 'modify',
          modifiedContent: '修改后的内容',
          feedback: undefined,
        },
      )
    })
  })

  it('shows reject form and submits with feedback', async () => {
    const user = userEvent.setup()
    render(<InterventionPanel nodeId="node-1" />)

    await user.click(screen.getByTestId('intervention-reject'))

    const textarea = screen.getByTestId('intervention-reject-feedback')
    await user.type(textarea, '不符合要求')

    await user.click(screen.getByTestId('intervention-submit-reject'))

    await waitFor(() => {
      expect(mocks.resolveIntervention).toHaveBeenCalledWith(
        'exec-1',
        'step-1',
        { action: 'reject', feedback: '不符合要求' },
      )
    })
  })

  it('displays error message when API call fails', async () => {
    mocks.resolveIntervention.mockRejectedValue(new Error('网络错误'))
    const user = userEvent.setup()
    render(<InterventionPanel nodeId="node-1" />)

    await user.click(screen.getByTestId('intervention-approve'))

    await waitFor(() => {
      expect(screen.getByTestId('intervention-error')).toHaveTextContent(
        '网络错误',
      )
    })
  })

  it('returns to idle mode when cancel is clicked in modify mode', async () => {
    const user = userEvent.setup()
    render(<InterventionPanel nodeId="node-1" />)

    await user.click(screen.getByTestId('intervention-modify'))
    expect(
      screen.getByTestId('intervention-modified-content'),
    ).toBeInTheDocument()

    await user.click(screen.getByText('取消'))

    expect(
      screen.queryByTestId('intervention-modified-content'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('intervention-approve')).toBeInTheDocument()
  })

  it('returns to idle mode when cancel is clicked in reject mode', async () => {
    const user = userEvent.setup()
    render(<InterventionPanel nodeId="node-1" />)

    await user.click(screen.getByTestId('intervention-reject'))
    expect(
      screen.getByTestId('intervention-reject-feedback'),
    ).toBeInTheDocument()

    await user.click(screen.getByText('取消'))

    expect(
      screen.queryByTestId('intervention-reject-feedback'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('intervention-approve')).toBeInTheDocument()
  })
})
