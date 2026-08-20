import { useQuery } from '@tanstack/react-query'
import {
  getExecution,
  type ExecutionResponse,
  listExecutions,
  type ListExecutionsParams,
} from '../api/executionApi'
import { executionKeys } from '../api/executionKeys'
import { normalizeExecutionDetail } from '../lib/normalizeExecutionDetail'
import type { ExecutionDetail } from '../types'

export function useExecutionList(
  workflowDefinitionId: string,
  params?: ListExecutionsParams,
) {
  return useQuery({
    queryKey: executionKeys.list({
      workflowDefinitionId,
      ...params,
    }),
    queryFn: () => listExecutions(workflowDefinitionId, params),
    staleTime: 30_000,
    enabled: !!workflowDefinitionId,
  })
}

export function useExecution(executionId: string) {
  return useQuery<ExecutionResponse, Error, ExecutionDetail>({
    queryKey: executionKeys.detail(executionId),
    queryFn: async () => {
      const response = await getExecution(executionId)
      return response.data
    },
    select: normalizeExecutionDetail,
    staleTime: 30_000,
    enabled: !!executionId,
  })
}
