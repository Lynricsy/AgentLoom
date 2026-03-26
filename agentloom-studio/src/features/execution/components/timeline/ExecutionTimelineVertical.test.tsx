import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExecutionTimelineVertical } from './ExecutionTimelineVertical'
import type { TimelineData } from '../../hooks/useTimelineData'

vi.mock('./TimelineEntry', () => ({
  TimelineEntry: ({
    data,
    isSelected,
    onSelect,
  }: {
    data: TimelineData
    isSelected: boolean
    onSelect: (nodeId: string) => void
  }) => (
    <div
      data-testid={`mock-entry-${data.step.id}`}
      data-selected={isSelected}
    >
      <button type="button" onClick={() => onSelect(data.step.nodeId)}>
        {data.step.nodeName}
      </button>
    </div>
  ),
}))

function createTimelineData(
  id: string,
  nodeId: string,
  name: string,
  stepOrder?: number,
): TimelineData {
  return {
    step: {
      id,
      executionId: 'exec-1',
      nodeId,
      nodeName: name,
      nodeType: 'chat-agent',
      status: 'completed',
      input: null,
      output: null,
      errorMessage: null,
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:01:00Z',
      retryCount: 0,
      stepOrder,
    },
    agentDecisionEvidence: undefined,
    interventionEvidence: undefined,
    outputFormatLevel: undefined,
    autonomyMode: undefined,
    evidenceCount: 0,
  }
}

const defaultProps = {
  selectedNodeId: null as string | null,
  onSelectNode: vi.fn(),
  executionStartedAt: '2026-01-01T00:00:00Z',
  executionCompletedAt: '2026-01-01T00:05:00Z',
}

describe('ExecutionTimelineVertical', () => {
  it('渲染空状态', () => {
    render(
      <ExecutionTimelineVertical
        timelineData={[]}
        {...defaultProps}
      />,
    )
    expect(screen.getByTestId('timeline-empty')).toBeInTheDocument()
  })

  it('渲染步骤列表', () => {
    const data = [
      createTimelineData('s1', 'n1', 'Node One', 1),
      createTimelineData('s2', 'n2', 'Node Two', 2),
    ]
    render(
      <ExecutionTimelineVertical
        timelineData={data}
        {...defaultProps}
      />,
    )
    expect(screen.getByTestId('execution-timeline-vertical')).toBeInTheDocument()
    expect(screen.getByTestId('mock-entry-s1')).toBeInTheDocument()
    expect(screen.getByTestId('mock-entry-s2')).toBeInTheDocument()
  })

  it('传递 isSelected 给匹配的步骤', () => {
    const data = [
      createTimelineData('s1', 'n1', 'Node One', 1),
      createTimelineData('s2', 'n2', 'Node Two', 2),
    ]
    render(
      <ExecutionTimelineVertical
        timelineData={data}
        {...defaultProps}
        selectedNodeId="n2"
      />,
    )
    expect(screen.getByTestId('mock-entry-s1').dataset.selected).toBe('false')
    expect(screen.getByTestId('mock-entry-s2').dataset.selected).toBe('true')
  })

  it('相同 stepOrder 的步骤分在同一组', () => {
    const data = [
      createTimelineData('s1', 'n1', 'Parallel A', 2),
      createTimelineData('s2', 'n2', 'Parallel B', 2),
      createTimelineData('s3', 'n3', 'Sequential', 3),
    ]
    render(
      <ExecutionTimelineVertical
        timelineData={data}
        {...defaultProps}
      />,
    )
    const group2 = screen.getByTestId('timeline-group-2')
    expect(group2).toBeInTheDocument()
    expect(screen.getByTestId('timeline-group-3')).toBeInTheDocument()
    expect(screen.getByTestId('mock-entry-s1')).toBeInTheDocument()
    expect(screen.getByTestId('mock-entry-s2')).toBeInTheDocument()
  })
})
