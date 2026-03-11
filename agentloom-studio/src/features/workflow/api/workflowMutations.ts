import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, toSnakeBody } from '../../../shared/api/client'
import type { ApiResponse } from '../../../shared/types/api'
import type {
  WorkflowDefinition,
  UpdateWorkflowPayload,
  CreateWorkflowPayload,
} from '../types'
import { workflowKeys } from './workflowKeys'

export function useUpdateWorkflow(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['workflow', 'save', id],
    mutationFn: async (payload: UpdateWorkflowPayload) => {
      const response = await apiClient
        .patch(`workflow-definitions/${id}`, {
          json: toSnakeBody(payload),
        })
        .json<ApiResponse<WorkflowDefinition>>()
      return response.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(workflowKeys.detail(id), data)
    },
    gcTime: 0,
  })
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['workflow', 'create'],
    mutationFn: async (payload: CreateWorkflowPayload) => {
      const response = await apiClient
        .post('workflow-definitions', {
          json: toSnakeBody(payload),
        })
        .json<ApiResponse<WorkflowDefinition>>()
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() })
    },
    gcTime: 0,
  })
}
