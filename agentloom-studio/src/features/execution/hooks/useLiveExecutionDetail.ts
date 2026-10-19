import { useEffect, useMemo, useRef } from 'react'
import { useAuthStore } from '@/features/auth'
import { useAuthToken } from './useAuthToken'
import { useExecution } from './useExecutionList'
import { useExecutionMonitor } from './useExecutionMonitor'
import {
  useAllNodeStates,
  useExecutionActions,
  useExecutionStatus,
  useExecutionProgress,
  useExecutionStore,
} from '../stores/executionStore'
import type {
  ExecutionDetail,
  ExecutionStateSnapshot,
  ExecutionStepErrorDetail,
  ExecutionStep,
  ExecutionStepStatus,
} from '../types'

function toLiveStepStatus(status: string): ExecutionStepStatus {
  return status === 'waiting_intervention'
    ? 'waiting_for_intervention'
    : (status as ExecutionStepStatus)
}

function toSnapshot(execution: ExecutionDetail): ExecutionStateSnapshot {
  return {
    executionId: execution.id,
    status: execution.status,
    completedSteps: execution.completedSteps ?? 0,
    totalSteps: execution.totalSteps ?? execution.steps.length,
    snapshotAt: execution.updatedAt,
    steps: execution.steps.map((step) => ({
      stepId: step.id,
      nodeId: step.nodeId,
      status:
        step.status === 'waiting_for_intervention'
          ? 'waiting_intervention'
          : step.status,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      ...(step.errorMessage ? { errorMessage: step.errorMessage } : {}),
      ...(step.output ? { result: step.output } : {}),
      ...(step.checkpointData ? { checkpointData: step.checkpointData } : {}),
    })),
  }
}

function cloneErrorDetail(
  detail: ExecutionStepErrorDetail | null | undefined,
): ExecutionStepErrorDetail | null | undefined {
  if (!detail) {
    return detail
  }

  return {
    ...detail,
    ...(detail.errors
      ? { errors: detail.errors.map((error) => ({ ...error })) }
      : {}),
    ...(detail.typeMismatch ? { typeMismatch: { ...detail.typeMismatch } } : {}),
    ...(detail.attempts
      ? { attempts: detail.attempts.map((attempt) => ({ ...attempt })) }
      : {}),
  }
}

function mergeStepWithLiveState(
  step: ExecutionStep,
  liveNode: ReturnType<typeof useAllNodeStates>[string] | undefined,
): ExecutionStep {
  if (!liveNode) {
    return step
  }

  const liveToolCalls = Object.values(liveNode.toolCalls)
  const checkpointData =
    liveNode.checkpointData !== undefined
      ? (liveNode.checkpointData
          ? { ...liveNode.checkpointData }
          : null)
      : step.checkpointData
        ? { ...step.checkpointData }
        : null

  if (checkpointData && liveToolCalls.length > 0) {
    checkpointData.toolCalls = liveToolCalls
  }

  const output =
    liveNode.result !== undefined
      ? liveNode.result
      : liveNode.output.length > 0
        ? { ...(step.output ?? {}), content: liveNode.output }
        : step.output

  return {
    ...step,
    status: toLiveStepStatus(liveNode.status),
    output,
    errorMessage: liveNode.errorMessage ?? step.errorMessage,
    errorDetail: cloneErrorDetail(
      (liveNode.errorDetail as ExecutionStepErrorDetail | null | undefined) ??
        step.errorDetail,
    ),
    // 实时事件携带落库的开始/结束时间（重置为 pending 时为 null），定义了就以实时为准
    startedAt: liveNode.startedAt !== undefined ? liveNode.startedAt : step.startedAt,
    completedAt:
      liveNode.completedAt !== undefined ? liveNode.completedAt : step.completedAt,
    checkpointData,
  }
}

/**
 * 用 REST 执行详情 hydrate executionStore：每个执行只 hydrate 一次，且只在 store 正跟踪该执行、
 * 尚未收到 socket 事件时写入，之后由 socket 驱动。执行页与重进画布恢复执行共用。
 */
export function useExecutionSnapshotHydration(executionId: string | undefined) {
  const query = useExecution(executionId ?? '')
  const { initFromSnapshot } = useExecutionActions()
  const hydratedExecutionIdRef = useRef<string | null>(null)
  const execution = query.data

  useEffect(() => {
    if (
      !executionId ||
      !execution ||
      execution.id !== executionId ||
      hydratedExecutionIdRef.current === executionId ||
      useExecutionStore.getState().executionId !== executionId
    ) {
      return
    }

    initFromSnapshot(toSnapshot(execution))
    hydratedExecutionIdRef.current = executionId
  }, [execution, executionId, initFromSnapshot])

  return query
}

export function useLiveExecutionDetail(executionId: string) {
  const authToken = useAuthToken()
  const tenantId = useAuthStore((state) => state.tenantId ?? undefined)
  const { initExecution, reset } = useExecutionActions()
  const nodeStates = useAllNodeStates()
  const storeStatus = useExecutionStatus()
  const { completedSteps, totalSteps } = useExecutionProgress()
  const liveCompletedAt = useExecutionStore((state) => state.executionCompletedAt)

  useEffect(() => {
    initExecution(executionId)
    return () => {
      reset()
    }
  }, [executionId, initExecution, reset])

  const { data: execution, ...query } =
    useExecutionSnapshotHydration(executionId)

  const monitor = useExecutionMonitor({
    tenantId,
    executionId,
    authToken: authToken ?? undefined,
  })

  const liveExecution = useMemo(() => {
    if (!execution) {
      return undefined
    }

    const steps = execution.steps.map((step) =>
      mergeStepWithLiveState(step, nodeStates[step.nodeId]),
    )

    return {
      ...execution,
      status: storeStatus ?? execution.status,
      completedAt: execution.completedAt ?? liveCompletedAt,
      completedSteps: completedSteps || execution.completedSteps,
      totalSteps: totalSteps || execution.totalSteps,
      steps,
    } satisfies ExecutionDetail
  }, [
    completedSteps,
    execution,
    liveCompletedAt,
    nodeStates,
    storeStatus,
    totalSteps,
  ])

  return {
    ...query,
    data: liveExecution,
    monitor,
  }
}
