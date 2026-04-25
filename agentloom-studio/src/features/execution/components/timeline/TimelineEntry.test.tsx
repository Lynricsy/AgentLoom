import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TimelineEntry } from './TimelineEntry'
import type { TimelineData } from '../../hooks/useTimelineData'

vi.mock('./TimelineHeader', () => ({
  TimelineHeader: ({ nodeName, status }: { nodeName: string; status: string }) => (
    <div data-testid="mock-timeline-header">{nodeName} - {status}</div>
  ),
}))

vi.mock('./TimelineDuration', () => ({
  TimelineDuration: () => <div data-testid="mock-timeline-duration" />,
}))

vi.mock('./TimelineIO', () => ({
  TimelineIO: () => <div data-testid="mock-timeline-io" />,
}))

vi.mock('./DecisionAnnotation', () => ({
  DecisionAnnotation: ({ showDetails }: { showDetails?: boolean }) => (
    <div data-testid="mock-decision-annotation">{showDetails ? 'expanded' : 'collapsed'}</div>
  ),
}))

vi.mock('./OutputLevelBadge', () => ({
  OutputLevelBadge: ({ level }: { level: number | null }) => (
    level ? <div data-testid="mock-output-level-badge">L{level}</div> : null
  ),
}))

vi.mock('./EvidenceChips', () => ({
  EvidenceChips: ({ count }: { count: number }) => (
    count > 0 ? <div data-testid="mock-evidence-chips">{count}</div> : null
  ),
}))

vi.mock('./FailedNodeError', () => ({
  FailedNodeError: ({ errorMessage }: { errorMessage: string | null }) => (
    errorMessage ? <div data-testid="mock-failed-node-error">{errorMessage}</div> : null
  ),
}))

function createTimelineData(overrides: Partial<TimelineData> = {}): TimelineData {
  return {
    step: {
      id: 'step-1',
      executionId: 'exec-1',
      nodeId: 'node-1',
      nodeName: 'Test Node',
      nodeType: 'agent',
      status: 'completed',
        input: { prompt: 'hello' },
        nodeData: null,
        output: { response: 'world' },
        errorMessage: null,
        errorDetail: null,
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:01:00Z',
        retryCount: 0,
    },
    agentDecisionEvidence: undefined,
    interventionEvidence: undefined,
    outputFormatLevel: undefined,
    autonomyMode: undefined,
    evidenceCount: 0,
    ...overrides,
  }
}

const defaultProps = {
  executionStartedAt: '2026-01-01T00:00:00Z',
  executionCompletedAt: '2026-01-01T00:05:00Z',
}

describe('TimelineEntry', () => {
  it('渲染步骤头信息', () => {
    const data = createTimelineData()
    render(
      <TimelineEntry
        data={data}
        isSelected={false}
        onSelect={vi.fn()}
        {...defaultProps}
      />,
    )
    expect(screen.getByTestId('timeline-entry-step-1')).toBeInTheDocument()
    expect(screen.getByTestId('mock-timeline-header')).toHaveTextContent('Test Node')
  })

  it('点击切换展开/折叠', () => {
    const onSelect = vi.fn()
    const data = createTimelineData()
    render(
      <TimelineEntry
        data={data}
        isSelected={false}
        onSelect={onSelect}
        {...defaultProps}
      />,
    )

    expect(screen.queryByTestId('mock-timeline-io')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalled()
    expect(screen.getByTestId('mock-timeline-io')).toBeInTheDocument()
  })

  it('失败步骤自动展开', () => {
    const data = createTimelineData({
      step: {
        id: 'step-fail',
        executionId: 'exec-1',
        nodeId: 'node-fail',
        nodeName: 'Failed Node',
        nodeType: 'http-tool',
        status: 'failed',
        input: null,
        nodeData: null,
        output: null,
        errorMessage: 'Connection refused',
        errorDetail: null,
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:00:30Z',
        retryCount: 0,
      },
    })
    render(
      <TimelineEntry
        data={data}
        isSelected={false}
        onSelect={vi.fn()}
        {...defaultProps}
      />,
    )
    expect(screen.getByTestId('mock-failed-node-error')).toHaveTextContent('Connection refused')
  })

  it('选中状态高亮边框', () => {
    const data = createTimelineData()
    render(
      <TimelineEntry
        data={data}
        isSelected={true}
        onSelect={vi.fn()}
        {...defaultProps}
      />,
    )
    const entry = screen.getByTestId('timeline-entry-step-1')
    expect(entry.className).toContain('border-primary')
  })

  it('默认显示决策标注容器，展开后显示详细内容', () => {
    const data = createTimelineData({ autonomyMode: 'FIXED' })
    render(
      <TimelineEntry
        data={data}
        isSelected={false}
        onSelect={vi.fn()}
        {...defaultProps}
      />,
    )

    expect(screen.getByTestId('mock-decision-annotation')).toHaveTextContent(
      'collapsed',
    )

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByTestId('mock-decision-annotation')).toHaveTextContent(
      'expanded',
    )
  })

  it('渲染 OutputLevelBadge 和 EvidenceChips', () => {
    const data = createTimelineData({
      outputFormatLevel: 2,
      evidenceCount: 3,
    })
    render(
      <TimelineEntry
        data={data}
        isSelected={false}
        onSelect={vi.fn()}
        {...defaultProps}
      />,
    )
    expect(screen.getByTestId('mock-output-level-badge')).toHaveTextContent('L2')
    expect(screen.getByTestId('mock-evidence-chips')).toHaveTextContent('3')
  })
})
