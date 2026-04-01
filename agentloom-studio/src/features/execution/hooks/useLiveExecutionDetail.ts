import { useEffect, useMemo } from 'react'
import { useAuthStore } from '@/features/auth/stores/auth.store'
import { useAuthToken } from './useAuthToken'
import { useExecution } from './useExecutionList'
import { useExecutionMonitor } from './useExecutionMonitor'
import {
  useAllNodeStates,
  useExecutionActions,
  useExecutionStatus,
  useExecutionProgress,
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
  const checkpointData = step.checkpointData
    ? { ...step.checkpointData }
    : null

  if (checkpointData && liveToolCalls.length > 0) {
    checkpointData.toolCalls = liveToolCalls
  }

  const output =
    liveNode.output.length > 0
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
    startedAt: liveNode.startedAt ?? step.startedAt,
    completedAt: liveNode.completedAt ?? step.completedAt,
    checkpointData,
  }
}

export function useLiveExecutionDetail(executionId: string) {
  const authToken = useAuthToken()
  const tenantId = useAuthStore((state) => state.tenantId ?? undefined)
  const { data: execution, ...query } = useExecution(executionId)
  const { initExecution, applySnapshot, reset } = useExecutionActions()
  const nodeStates = useAllNodeStates()
  const storeStatus = useExecutionStatus()
  const { completedSteps, totalSteps } = useExecutionProgress()

  useEffect(() => {
    initExecution(executionId)
    return () => {
      reset()
    }
  }, [executionId, initExecution, reset])

  useEffect(() => {
    if (!execution) {
      return
    }

    if (Object.keys(nodeStates).length === 0) {
      applySnapshot(toSnapshot(execution))
    }
  }, [applySnapshot, execution, nodeStates])

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
      completedSteps: completedSteps || execution.completedSteps,
      totalSteps: totalSteps || execution.totalSteps,
      steps,
    } satisfies ExecutionDetail
  }, [
    completedSteps,
    execution,
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
