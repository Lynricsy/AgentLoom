import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExecutionStore } from '../stores/executionStore'
import type {
  ExecutionEvent,
  ExecutionStatusChangedPayload,
  StepStatusChangedPayload,
} from '../types'
import { useLiveExecutionDetail } from './useLiveExecutionDetail'

const mocks = vi.hoisted(() => ({
  getExecutionMock: vi.fn(),
}))

vi.mock('../api/executionApi', () => ({
  getExecution: (...args: unknown[]) => mocks.getExecutionMock(...args),
}))

vi.mock('./useExecutionMonitor', () => ({
  useExecutionMonitor: () => ({ connectionStatus: 'connected', lastEventId: 0, error: null }),
}))

vi.mock('./useAuthToken', () => ({
  useAuthToken: () => 'token',
}))

vi.mock('@/features/auth', () => ({
  useAuthStore: (selector: (state: { tenantId: string }) => unknown) =>
    selector({ tenantId: 'tenant-1' }),
}))

const EXECUTION_ID = 'exec-1'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

/** 打开执行页时 Agent 等待干预、输出节点未开始：REST 快照里两者都没有结束时间 */
function pausedExecutionDetail() {
  return {
    data: {
      id: EXECUTION_ID,
      tenantId: 'tenant-1',
      workflowDefinitionId: 'wf-1',
      workflowVersionId: 'ver-1',
      status: 'paused',
      triggerType: 'manual',
      inputParams: {},
      startedAt: '2026-10-19T16:48:13.240Z',
      completedAt: null,
      errorMessage: null,
      totalSteps: 2,
      completedSteps: 0,
      createdAt: '2026-10-19T16:48:13.200Z',
      updatedAt: '2026-10-19T16:48:13.300Z',
      steps: [
        {
          id: 'step-agent',
          executionId: EXECUTION_ID,
          nodeId: 'node-agent',
          stepOrder: 0,
          nodeType: 'agent',
          status: 'waiting_intervention',
          result: null,
          checkpointData: null,
          startedAt: '2026-10-19T16:48:13.282Z',
          completedAt: null,
        },
        {
          id: 'step-out',
          executionId: EXECUTION_ID,
          nodeId: 'node-out',
          stepOrder: 1,
          nodeType: 'text-output',
          status: 'pending',
          result: null,
          checkpointData: null,
          startedAt: null,
          completedAt: null,
        },
      ],
    },
  }
}

function stepEvent(
  eventId: number,
  data: StepStatusChangedPayload,
): ExecutionEvent<StepStatusChangedPayload> {
  return {
    eventId,
    event: 'execution.node.status-changed',
    timestamp: '2026-10-19T16:48:50.800Z',
    executionId: EXECUTION_ID,
    tenantId: 'tenant-1',
    data,
  }
}

describe('useLiveExecutionDetail（D-138 实时时间）', () => {
  beforeEach(() => {
    mocks.getExecutionMock.mockReset()
    useExecutionStore.getState().actions.reset()
  })

  it('实时批准后步骤与执行的开始/结束时间来自 socket 事件，不需要重新拉取详情', async () => {
    mocks.getExecutionMock.mockResolvedValue(pausedExecutionDetail())
    const { result } = renderHook(() => useLiveExecutionDetail(EXECUTION_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data?.status).toBe('paused')
    })

    const { updateNodeStatus, updateExecutionStatus } =
      useExecutionStore.getState().actions
    act(() => {
      updateNodeStatus(
        stepEvent(1, {
          stepId: 'step-agent',
          nodeId: 'node-agent',
          from: 'waiting_intervention',
          to: 'completed',
          startedAt: '2026-10-19T16:48:13.282Z',
          completedAt: '2026-10-19T16:48:50.742Z',
        }),
      )
      updateNodeStatus(
        stepEvent(2, {
          stepId: 'step-out',
          nodeId: 'node-out',
          from: 'pending',
          to: 'completed',
          startedAt: '2026-10-19T16:48:50.750Z',
          completedAt: '2026-10-19T16:48:50.752Z',
        }),
      )
      updateExecutionStatus({
        eventId: 3,
        event: 'execution.status.changed',
        timestamp: '2026-10-19T16:48:50.800Z',
        executionId: EXECUTION_ID,
        tenantId: 'tenant-1',
        data: {
          executionId: EXECUTION_ID,
          status: 'completed',
          completedSteps: 2,
          totalSteps: 2,
          completedAt: '2026-10-19T16:48:50.760Z',
        } satisfies ExecutionStatusChangedPayload,
      })
    })

    const execution = result.current.data
    expect(execution?.status).toBe('completed')
    expect(execution?.completedAt).toBe('2026-10-19T16:48:50.760Z')
    expect(execution?.steps.map((step) => [step.nodeId, step.startedAt, step.completedAt])).toEqual([
      ['node-agent', '2026-10-19T16:48:13.282Z', '2026-10-19T16:48:50.742Z'],
      ['node-out', '2026-10-19T16:48:50.750Z', '2026-10-19T16:48:50.752Z'],
    ])
    expect(mocks.getExecutionMock).toHaveBeenCalledTimes(1)
  })
})
