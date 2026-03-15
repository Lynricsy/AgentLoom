import { useCallback } from 'react'
import { useExecutionActions } from '../stores/executionStore'
import { useRunWorkflow } from '../api/executionMutations'
import type {
  ExecutionLaunchSource,
  ExecutionResponse,
} from '../api/executionApi'

interface StartExecutionOptions {
  inputParams?: Record<string, unknown>
  schemaVersion?: number
  launchSource?: ExecutionLaunchSource
}

interface StartExecutionResult {
  startExecution: (
    workflowId: string,
    options?: StartExecutionOptions,
  ) => Promise<ExecutionResponse>
  isStarting: boolean
  error: Error | null
  reset: () => void
}

/** POST /run → initExecution(id) → WebSocket 自动连接 */
export function useStartExecution(): StartExecutionResult {
  const { initExecution } = useExecutionActions()
  const mutation = useRunWorkflow()

  const startExecution = useCallback(
    async (
      workflowId: string,
      options?: StartExecutionOptions,
    ): Promise<ExecutionResponse> => {
      const result = await mutation.mutateAsync({
        workflowId,
        inputParams: options?.inputParams,
        schemaVersion: options?.schemaVersion,
        launchSource: options?.launchSource,
      })

      // 初始化 executionStore — 触发 useExecutionId() 更新 → useExecutionMonitor 连接 socket
      initExecution(result.data.id)

      return result.data
    },
    [initExecution, mutation],
  )

  return {
    startExecution,
    isStarting: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  }
}
