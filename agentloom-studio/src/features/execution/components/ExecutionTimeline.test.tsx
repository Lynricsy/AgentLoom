import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExecutionTimeline } from './ExecutionTimeline'
import type { ExecutionStep } from '../types'

function createStep(overrides: Partial<ExecutionStep>): ExecutionStep {
  return {
    id: 'step-1',
    executionId: 'exec-1',
    nodeId: 'node-1',
    nodeName: 'Node One',
    nodeType: 'llm-agent',
    status: 'completed',
    input: null,
    output: null,
    errorMessage: null,
    startedAt: '2026-03-10T10:00:00.000Z',
    completedAt: '2026-03-10T10:00:05.000Z',
    retryCount: 0,
    ...overrides,
  }
}

describe('ExecutionTimeline', () => {
  it('按步骤渲染时间线行并支持节点选择', () => {
    const onSelectNode = vi.fn()

    render(
      <ExecutionTimeline
        steps={[
          createStep({
            id: 'step-1',
            output: { summary: 'done' },
          }),
          createStep({
            id: 'step-2',
            nodeId: 'node-2',
            nodeName: 'Node Two',
            nodeType: 'http-tool',
            status: 'failed',
            errorMessage: 'boom',
            startedAt: '2026-03-10T10:00:05.000Z',
            completedAt: '2026-03-10T10:00:09.000Z',
          }),
        ]}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
    )

    expect(screen.getByTestId('execution-timeline-item-step-1')).toBeInTheDocument()
    expect(screen.getByTestId('execution-timeline-item-step-2')).toBeInTheDocument()
    expect(screen.getByText('Node One')).toBeInTheDocument()
    expect(screen.getByText('Node Two')).toBeInTheDocument()
    expect(screen.getByText('错误：boom')).toBeInTheDocument()
    expect(screen.getByText('耗时：5s')).toBeInTheDocument()
    expect(screen.getByText('耗时：4s')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('execution-timeline-item-step-2'))

    expect(onSelectNode).toHaveBeenCalledWith('node-2')
  })
})
