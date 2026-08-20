import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeExecutionOverlay } from './NodeExecutionOverlay'
import type { NodeExecutionState } from '@/features/execution'

const storeMocks = vi.hoisted(() => ({
  mockNodeState: null as NodeExecutionState | null,
  mockIsActive: false,
}))

vi.mock('@/features/execution', () => ({
  useNodeExecutionState: (_nodeId: string) => storeMocks.mockNodeState,
  useIsExecutionActive: () => storeMocks.mockIsActive,
}))

function makeNodeState(
  overrides: Partial<NodeExecutionState> = {},
): NodeExecutionState {
  return {
    stepId: 'step-1',
    nodeId: 'node-1',
    status: 'running',
    output: '',
    isStreaming: false,
    toolCalls: {},
    agentEvents: [],
    subAgentStreams: {},
    ...overrides,
  }
}

describe('NodeExecutionOverlay', () => {
  beforeEach(() => {
    storeMocks.mockNodeState = null
    storeMocks.mockIsActive = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when no execution state', () => {
    const { container } = render(<NodeExecutionOverlay nodeId="node-1" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when inactive and status is pending', () => {
    storeMocks.mockNodeState = makeNodeState({ status: 'pending' })
    storeMocks.mockIsActive = false
    const { container } = render(<NodeExecutionOverlay nodeId="node-1" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders pending status when execution is active', () => {
    storeMocks.mockNodeState = makeNodeState({ status: 'pending' })
    storeMocks.mockIsActive = true
    render(<NodeExecutionOverlay nodeId="node-1" />)
    expect(screen.getByTestId('exec-overlay-node-1')).toBeInTheDocument()
    expect(screen.getByTestId('exec-overlay-node-1')).toHaveAttribute(
      'data-exec-status',
      'pending',
    )
  })

  describe.each([
    ['running', '运行中', 'exec-overlay--running'],
    ['completed', '已完成', undefined],
    ['failed', '执行失败', undefined],
    ['waiting_intervention', '等待干预', 'exec-overlay--waiting'],
    ['skipped', '已跳过', undefined],
    ['cancelled', '已取消', undefined],
    ['queued', '排队中', undefined],
  ] as const)('status=%s', (status, label, animClass) => {
    beforeEach(() => {
      storeMocks.mockNodeState = makeNodeState({ status })
      storeMocks.mockIsActive = true
    })

    it('renders overlay with correct data-exec-status', () => {
      render(<NodeExecutionOverlay nodeId="node-1" />)
      const overlay = screen.getByTestId('exec-overlay-node-1')
      expect(overlay).toHaveAttribute('data-exec-status', status)
    })

    it(`badge title contains "${label}"`, () => {
      render(<NodeExecutionOverlay nodeId="node-1" />)
      const badge = screen.getByTitle(label)
      expect(badge).toBeInTheDocument()
    })

    if (animClass) {
      it(`applies animation class ${animClass}`, () => {
        render(<NodeExecutionOverlay nodeId="node-1" />)
        const overlay = screen.getByTestId('exec-overlay-node-1')
        expect(overlay.className).toContain(animClass)
      })
    }
  })

  it('shows error message in badge title for failed status', () => {
    storeMocks.mockNodeState = makeNodeState({
      status: 'failed',
      errorMessage: 'LLM timeout',
    })
    storeMocks.mockIsActive = true
    render(<NodeExecutionOverlay nodeId="node-1" />)
    expect(screen.getByTitle('执行失败: LLM timeout')).toBeInTheDocument()
  })

  it('displays retry counter when retry info is present', () => {
    storeMocks.mockNodeState = makeNodeState({
      status: 'running',
      retryAttempt: 2,
      retryMaxAttempts: 3,
    })
    storeMocks.mockIsActive = true
    render(<NodeExecutionOverlay nodeId="node-1" />)
    const retry = screen.getByTestId('exec-retry-node-1')
    expect(retry.textContent).toBe('2/3')
  })

  it('hides retry counter when retry info is absent', () => {
    storeMocks.mockNodeState = makeNodeState({ status: 'running' })
    storeMocks.mockIsActive = true
    render(<NodeExecutionOverlay nodeId="node-1" />)
    expect(screen.queryByTestId('exec-retry-node-1')).not.toBeInTheDocument()
  })

  it('sets --exec-color CSS custom property', () => {
    storeMocks.mockNodeState = makeNodeState({ status: 'completed' })
    storeMocks.mockIsActive = true
    render(<NodeExecutionOverlay nodeId="node-1" />)
    const overlay = screen.getByTestId('exec-overlay-node-1')
    expect(overlay.style.getPropertyValue('--exec-color')).toBe(
      'var(--color-success, #22c55e)',
    )
  })

  it('renders completed overlay even when execution is inactive', () => {
    storeMocks.mockNodeState = makeNodeState({ status: 'completed' })
    storeMocks.mockIsActive = false
    render(<NodeExecutionOverlay nodeId="node-1" />)
    expect(screen.getByTestId('exec-overlay-node-1')).toBeInTheDocument()
  })
})
