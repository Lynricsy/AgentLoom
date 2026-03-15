import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../../shared/api/client'
import type { ApiResponse } from '../../../shared/types/api'
import type { WorkflowDefinition, WorkflowInputSchema } from '../types'
import { workflowKeys } from './workflowKeys'

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: workflowKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient
        .get(`workflow-definitions/${id}`)
        .json<ApiResponse<WorkflowDefinition>>()
      return response.data
    },
    enabled: !!id,
  })
}

interface UseWorkflowInputSchemaOptions {
  enabled?: boolean
}

export function useWorkflowInputSchema(
  id: string,
  options?: UseWorkflowInputSchemaOptions,
) {
  return useQuery({
    queryKey: workflowKeys.inputSchema(id),
    queryFn: async () => {
      const response = await apiClient
        .get(`workflow-definitions/${id}/input-schema`)
        .json<ApiResponse<WorkflowInputSchema>>()
      return response.data
    },
    enabled: Boolean(id) && (options?.enabled ?? true),
  })
}
