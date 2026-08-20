import type { ExecutionEnvelopeResponseSwaggerDto } from '@agentloom/api-client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  runWorkflow,
  cancelExecution,
  type ExecutionLaunchSource,
} from './executionApi'
import { executionKeys } from './executionKeys'

interface RunWorkflowParams {
  workflowId: string
  inputParams?: Record<string, unknown>
  schemaVersion?: number
  launchSource?: ExecutionLaunchSource
}

interface CancelExecutionParams {
  executionId: string
}

export function useRunWorkflow() {
  const queryClient = useQueryClient()

  return useMutation<
    ExecutionEnvelopeResponseSwaggerDto,
    Error,
    RunWorkflowParams
  >({
    mutationKey: ['execution', 'run'],
    mutationFn: ({ workflowId, inputParams, schemaVersion, launchSource }) =>
      runWorkflow(workflowId, {
        inputParams,
        schemaVersion,
        launchSource,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: executionKeys.detail(data.data.id),
      })
    },
    gcTime: 0,
  })
}

export function useCancelExecution() {
  const queryClient = useQueryClient()

  return useMutation<
    ExecutionEnvelopeResponseSwaggerDto,
    Error,
    CancelExecutionParams
  >({
    mutationKey: ['execution', 'cancel'],
    mutationFn: ({ executionId }) => cancelExecution(executionId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: executionKeys.detail(data.data.id),
      })
    },
    gcTime: 0,
  })
}
