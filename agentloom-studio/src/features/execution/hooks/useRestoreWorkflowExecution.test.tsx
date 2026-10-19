import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExecutionStore } from '../stores/executionStore'
import { useRestoreWorkflowExecution } from './useRestoreWorkflowExecution'

const mocks = vi.hoisted(() => ({
  getExecutionMock: vi.fn(),
  listExecutionsMock: vi.fn(),
}))

vi.mock('../api/executionApi', () => ({
  getExecution: (...args: unknown[]) => mocks.getExecutionMock(...args),
  listExecutions: (...args: unknown[]) => mocks.listExecutionsMock(...args),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

interface ListItem {
  id: string
  workflowDefinitionId: string
  status: string
  createdAt: string
}

function listItem(id: string, status: string): ListItem {
  return {
    id,
    workflowDefinitionId: 'wf-1',
    status,
    createdAt: '2026-10-19T16:00:00.000Z',
  }
}

function listResponse(items: ListItem[]) {
  return {
    data: items,
    meta: { page: 1, pageSize: 20, total: items.length, totalPages: 1 },
  }
}

function pausedExecutionDetail(id: string) {
  return {
    data: {
      id,
      tenantId: 'tenant-1',
      workflowDefinitionId: 'wf-1',
      workflowVersionId: 'ver-1',
      definitionSource: 'version',
      status: 'paused',
      triggerType: 'manual',
      inputParams: {},
      startedAt: '2026-10-19T16:00:00.000Z',
      completedAt: null,
      errorMessage: null,
      totalSteps: 2,
      completedSteps: 1,
      createdAt: '2026-10-19T16:00:00.000Z',
      updatedAt: '2026-10-19T16:00:05.000Z',
      steps: [
        {
          id: 'step-trigger',
          executionId: id,
          nodeId: 'node-trigger',
          stepOrder: 0,
          nodeType: 'manual-trigger',
          status: 'completed',
          result: { payload: {} },
          checkpointData: null,
          startedAt: '2026-10-19T16:00:00.000Z',
          completedAt: '2026-10-19T16:00:01.000Z',
        },
        {
          id: 'step-agent',
          executionId: id,
          nodeId: 'node-agent',
          stepOrder: 1,
          nodeType: 'agent',
          status: 'waiting_intervention',
          result: null,
          checkpointData: {
            partialContent: 'Agent 草稿回复',
            interventionNodeName: 'Agent',
            interventionRequestedAt: '2026-10-19T16:00:05.000Z',
          },
          startedAt: '2026-10-19T16:00:01.000Z',
          completedAt: null,
        },
      ],
    },
  }
}

describe('useRestoreWorkflowExecution（D-127 画布侧）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useExecutionStore.getState().actions.reset()
  })

  afterEach(() => {
    useExecutionStore.getState().actions.reset()
  })

  it('画布未跟踪执行时，恢复该工作流最近一个未结束的执行并 hydrate 等待干预', async () => {
    mocks.listExecutionsMock.mockResolvedValue(
      listResponse([
        listItem('exec-done', 'completed'),
        listItem('exec-paused', 'paused'),
      ]),
    )
    mocks.getExecutionMock.mockResolvedValue(pausedExecutionDetail('exec-paused'))

    renderHook(() => useRestoreWorkflowExecution('wf-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(
        useExecutionStore.getState().nodes['node-agent']?.intervention,
      ).toBeDefined()
    })
    const state = useExecutionStore.getState()
    expect(mocks.listExecutionsMock).toHaveBeenCalledWith('wf-1')
    expect(mocks.getExecutionMock).toHaveBeenCalledWith('exec-paused')
    expect(state.executionId).toBe('exec-paused')
    expect(state.status).toBe('paused')
    expect(state.nodes['node-agent']?.status).toBe('waiting_intervention')
    expect(state.nodes['node-trigger']?.status).toBe('completed')
  })

  it('只有终态执行时不恢复', async () => {
    mocks.listExecutionsMock.mockResolvedValue(
      listResponse([listItem('exec-done', 'completed'), listItem('exec-failed', 'failed')]),
    )

    renderHook(() => useRestoreWorkflowExecution('wf-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(mocks.listExecutionsMock).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useExecutionStore.getState().executionId).toBeNull()
    expect(mocks.getExecutionMock).not.toHaveBeenCalled()
  })

  it('画布已在跟踪执行（本次会话刚运行）时不覆盖', async () => {
    mocks.listExecutionsMock.mockResolvedValue(
      listResponse([listItem('exec-paused', 'paused')]),
    )
    useExecutionStore.getState().actions.initExecution('exec-current')

    renderHook(() => useRestoreWorkflowExecution('wf-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(mocks.listExecutionsMock).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useExecutionStore.getState().executionId).toBe('exec-current')
    expect(mocks.getExecutionMock).not.toHaveBeenCalled()
  })

  it('从执行页返回：首次渲染仍是执行页的 executionId、随后被执行页卸载清空，仍恢复', async () => {
    mocks.listExecutionsMock.mockResolvedValue(
      listResponse([listItem('exec-paused', 'paused')]),
    )
    mocks.getExecutionMock.mockResolvedValue(pausedExecutionDetail('exec-paused'))
    useExecutionStore.getState().actions.initExecution('exec-viewed')

    renderHook(() => useRestoreWorkflowExecution('wf-1'), {
      wrapper: createWrapper(),
    })
    act(() => {
      useExecutionStore.getState().actions.reset()
    })

    await waitFor(() => {
      expect(
        useExecutionStore.getState().nodes['node-agent']?.intervention,
      ).toBeDefined()
    })
    expect(useExecutionStore.getState().executionId).toBe('exec-paused')
  })

  it('恢复详情返回前用户已开始新执行时，不用旧快照覆盖', async () => {
    mocks.listExecutionsMock.mockResolvedValue(
      listResponse([listItem('exec-paused', 'paused')]),
    )
    let resolveDetail: (value: unknown) => void = () => {}
    mocks.getExecutionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve
      }),
    )

    renderHook(() => useRestoreWorkflowExecution('wf-1'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(mocks.getExecutionMock).toHaveBeenCalled())

    useExecutionStore.getState().actions.initExecution('exec-new')
    resolveDetail(pausedExecutionDetail('exec-paused'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const state = useExecutionStore.getState()
    expect(state.executionId).toBe('exec-new')
    expect(state.nodes['node-agent']).toBeUndefined()
  })
})
