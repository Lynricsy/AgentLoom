import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  runWorkflow,
  cancelExecution,
  type ExecutionResponse,
} from './executionApi'
import { executionKeys } from './executionKeys'

interface RunWorkflowParams {
  workflowId: string
  inputParams?: Record<string, unknown>
}

interface CancelExecutionParams {
  executionId: string
}

export function useRunWorkflow() {
  const queryClient = useQueryClient()

  return useMutation<
    { data: ExecutionResponse },
    Error,
    RunWorkflowParams
  >({
    mutationKey: ['execution', 'run'],
    mutationFn: ({ workflowId, inputParams }) =>
      runWorkflow(workflowId, inputParams),
    onSuccess: (data) => {
      queryClient.setQueryData(
        executionKeys.detail(data.data.id),
        data,
      )
    },
    gcTime: 0,
  })
}

export function useCancelExecution() {
  const queryClient = useQueryClient()

  return useMutation<
    { data: ExecutionResponse },
    Error,
    CancelExecutionParams
  >({
    mutationKey: ['execution', 'cancel'],
    mutationFn: ({ executionId }) => cancelExecution(executionId),
    onSuccess: (data) => {
      queryClient.setQueryData(
        executionKeys.detail(data.data.id),
        data,
      )
    },
    gcTime: 0,
  })
}
