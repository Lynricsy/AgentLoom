import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExecutionStore, useNodeExecutionState } from '../stores/executionStore'
import type { ExecutionStateSnapshot, StepStatus } from '../types'
import { toCanvasNodeId } from './reusableBlockState'

vi.mock('../api/executionApi', () => ({
  resolveIntervention: vi.fn(),
  resolveToolPermission: vi.fn(),
}))

function applySteps(
  steps: Array<{
    nodeId: string
    status: StepStatus
    startedAt?: string | null
    completedAt?: string | null
    errorMessage?: string
  }>,
) {
  const snapshot: ExecutionStateSnapshot = {
    executionId: 'exec-1',
    status: 'running',
    completedSteps: 0,
    totalSteps: steps.length,
    snapshotAt: '2026-10-01T00:00:00Z',
    steps: steps.map((step, index) => ({
      stepId: `step-${index}`,
      startedAt: null,
      completedAt: null,
      ...step,
    })),
  }
  act(() => {
    useExecutionStore.getState().actions.applySnapshot(snapshot)
  })
}

describe('可复用块状态聚合（块内步骤 nodeId = <blockNodeId>::<innerId>）', () => {
  beforeEach(() => {
    useExecutionStore.getState().actions.reset()
  })

  it('块节点没有自己的步骤时，useNodeExecutionState 返回内部步骤的聚合状态', () => {
    applySteps([
      { nodeId: 'blk::a', status: 'completed', startedAt: '2026-10-01T00:00:01Z', completedAt: '2026-10-01T00:00:02Z' },
      { nodeId: 'blk::b', status: 'running', startedAt: '2026-10-01T00:00:02Z' },
      { nodeId: 'other', status: 'failed' },
    ])

    const { result } = renderHook(() => useNodeExecutionState('blk'))

    expect(result.current).toMatchObject({
      nodeId: 'blk',
      status: 'running',
      startedAt: '2026-10-01T00:00:01Z',
      completedAt: null,
    })
  })

  it.each<[string, StepStatus, StepStatus[]]>([
    ['全部完成', 'completed', ['completed', 'completed']],
    ['完成 + 跳过（分支未走）', 'completed', ['completed', 'skipped']],
    ['部分完成、其余未调度', 'running', ['completed', 'pending']],
    ['尚未开始', 'pending', ['pending', 'pending']],
    ['任一失败', 'failed', ['completed', 'failed', 'pending']],
    ['等待人工干预', 'waiting_intervention', ['completed', 'waiting_intervention']],
  ])('%s → %s', (_case, expected, statuses) => {
    applySteps(statuses.map((status, index) => ({ nodeId: `blk::n${index}`, status })))

    const { result } = renderHook(() => useNodeExecutionState('blk'))

    expect(result.current?.status).toBe(expected)
  })

  it('失败时带出失败内部步骤的错误信息；嵌套块的步骤也归属外层块', () => {
    applySteps([
      { nodeId: 'blk::inner::x', status: 'failed', errorMessage: '脚本错误' },
      { nodeId: 'blk::y', status: 'completed' },
    ])

    const { result } = renderHook(() => useNodeExecutionState('blk'))

    expect(result.current).toMatchObject({ status: 'failed', errorMessage: '脚本错误' })
    expect(toCanvasNodeId('blk::inner::x')).toBe('blk')
  })

  it('状态变化时重新聚合；不相关节点或无内部步骤时为 null', () => {
    applySteps([{ nodeId: 'blk::a', status: 'running' }])
    const { result } = renderHook(() => useNodeExecutionState('blk'))
    expect(result.current?.status).toBe('running')

    act(() => {
      useExecutionStore.getState().actions.updateNodeStatus({
        eventId: 2,
        event: 'execution.node.status-changed',
        timestamp: '2026-10-01T00:00:03Z',
        executionId: 'exec-1',
        tenantId: 't',
        data: { stepId: 'step-0', nodeId: 'blk::a', from: 'running', to: 'completed' },
      })
    })
    expect(result.current?.status).toBe('completed')

    const { result: unrelated } = renderHook(() => useNodeExecutionState('bl'))
    expect(unrelated.current).toBeNull()
  })
})
