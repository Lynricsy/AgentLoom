import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RunCard } from './RunCard'
import type { ExecutionResponse } from '../api/executionApi'

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

function createExecution(overrides: Partial<ExecutionResponse> = {}): ExecutionResponse {
  return {
    id: 'exec-001',
    tenantId: 'tenant-1',
    workflowDefinitionId: 'wf-001',
    workflowId: 'workflow-001',
    workflowVersionId: 'ver-001',
    status: 'completed',
    triggerType: 'manual',
    inputParams: {},
    definitionSnapshot: {
      nodes: [],
      edges: [],
    },
    startedAt: '2026-03-10T10:00:00.000Z',
    completedAt: '2026-03-10T10:01:15.000Z',
    failedAt: null,
    cancelledAt: null,
    errorMessage: null,
    totalSteps: 0,
    completedSteps: 0,
    createdBy: 'user-001',
    createdAt: '2026-03-10T09:59:58.000Z',
    updatedAt: '2026-03-10T10:01:15.000Z',
    ...overrides,
  }
}

describe('RunCard', () => {
  it('渲染状态、触发来源和耗时信息', () => {
    render(<RunCard execution={createExecution()} />)

    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByText('手动')).toBeInTheDocument()
    expect(screen.getByText('1m 15s')).toBeInTheDocument()
  })

  it('点击后导航到执行调试视图', () => {
    render(
      <RunCard
        execution={createExecution({
          id: 'exec-running',
          status: 'running',
          completedAt: null,
          triggerType: 'api',
        })}
      />,
    )

    fireEvent.click(screen.getByTestId('run-card-exec-running'))

    expect(screen.getByText('执行中')).toBeInTheDocument()
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/executions/$executionId',
      params: { executionId: 'exec-running' },
    })
  })
})
