import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExecutionHistoryPanel } from './ExecutionHistoryPanel'
import type { ExecutionResponse } from '../api/executionApi'

const mocks = vi.hoisted(() => ({
  useExecutionListMock: vi.fn(),
}))

vi.mock('../hooks/useExecutionList', () => ({
  useExecutionList: (...args: unknown[]) => mocks.useExecutionListMock(...args),
}))

vi.mock('./RunCard', () => ({
  RunCard: ({ execution }: { execution: ExecutionResponse }) => (
    <div data-testid="mock-run-card">{execution.id}</div>
  ),
}))

function createExecution(id: string): ExecutionResponse {
  return {
    id,
    tenantId: 'tenant-1',
    workflowDefinitionId: 'wf-001',
    workflowVersionId: 'ver-001',
    status: 'completed',
    triggerType: 'manual',
    inputParams: null,
    result: null,
    startedAt: '2026-03-10T10:00:00.000Z',
    completedAt: '2026-03-10T10:00:30.000Z',
    errorMessage: null,
    createdAt: '2026-03-10T10:00:00.000Z',
    updatedAt: '2026-03-10T10:00:30.000Z',
  }
}

describe('ExecutionHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染执行列表并显示分页', () => {
    mocks.useExecutionListMock.mockImplementation((_workflowId: string, params?: { page?: number }) => ({
      data: {
        data: params?.page === 2 ? [createExecution('exec-003')] : [createExecution('exec-001'), createExecution('exec-002')],
        meta: {
          page: params?.page ?? 1,
          pageSize: 6,
          total: 3,
          totalPages: 2,
        },
      },
      isLoading: false,
      isFetching: false,
      error: null,
    }))

    render(<ExecutionHistoryPanel workflowDefinitionId="wf-001" />)

    expect(screen.getAllByTestId('mock-run-card')).toHaveLength(2)
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    expect(mocks.useExecutionListMock).toHaveBeenLastCalledWith('wf-001', {
      page: 2,
      pageSize: 6,
    })
    expect(screen.getByText('exec-003')).toBeInTheDocument()
  })

  it('无数据时显示空状态', () => {
    mocks.useExecutionListMock.mockReturnValue({
      data: {
        data: [],
        meta: {
          page: 1,
          pageSize: 6,
          total: 0,
          totalPages: 1,
        },
      },
      isLoading: false,
      isFetching: false,
      error: null,
    })

    render(<ExecutionHistoryPanel workflowDefinitionId="wf-empty" />)

    expect(screen.getByText('No executions yet')).toBeInTheDocument()
  })
})
