import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../../shared/api/client'
import type { ApiResponse } from '../../../shared/types/api'
import type { WorkflowDefinition } from '../types'
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
