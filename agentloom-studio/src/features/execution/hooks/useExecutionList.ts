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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasExecutionResponseData(
  value: unknown,
): value is { data: ExecutionResponse } {
  return (
    isRecord(value) &&
    isRecord(value.data) &&
    typeof value.data.id === 'string'
  )
}

function toExecutionDetail(
  value: ExecutionResponse | { data: ExecutionResponse },
): ExecutionDetail {
  return normalizeExecutionDetail(
    hasExecutionResponseData(value) ? value.data : value,
  )
}

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
  return useQuery<
    ExecutionResponse | { data: ExecutionResponse },
    Error,
    ExecutionDetail
  >({
    queryKey: executionKeys.detail(executionId),
    queryFn: async () => {
      const response = await getExecution(executionId)
      return response.data
    },
    select: toExecutionDetail,
    staleTime: 30_000,
    enabled: !!executionId,
  })
}
