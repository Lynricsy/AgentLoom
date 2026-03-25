import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../../shared/api/client'
import type { ApiResponse } from '../../../shared/types/api'
import type { WorkflowDefinition, WorkflowInputSchema } from '../types'
import { workflowKeys } from './workflowKeys'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: workflowKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient
        .get(`workflow-definitions/${id}`)
        .json<ApiResponse<WorkflowDefinition>>()
      return response.data
    },
    enabled: !!id && UUID_RE.test(id),
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
