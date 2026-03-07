import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, toSnakeBody } from '../../../shared/api/client'
import type { ApiResponse } from '../../../shared/types/api'
import type {
  CreateVersionPayload,
  PublishWorkflowPayload,
  WorkflowVersion,
} from '../types'
import { versionKeys } from './versionKeys'
import { workflowKeys } from './workflowKeys'

export function useCreateVersion(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['workflow', 'createVersion', workflowId],
    mutationFn: async (payload: CreateVersionPayload) => {
      const response = await apiClient
        .post(`workflow-definitions/${workflowId}/versions`, {
          json: toSnakeBody(payload),
        })
        .json<ApiResponse<WorkflowVersion>>()
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: versionKeys.lists(workflowId),
      })
    },
    gcTime: 0,
  })
}

export function useRollbackVersion(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['workflow', 'rollback', workflowId],
    mutationFn: async (versionId: string) => {
      const response = await apiClient
        .post(`workflow-definitions/${workflowId}/versions/${versionId}/rollback`)
        .json<ApiResponse<WorkflowVersion>>()
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(workflowId),
      })
      queryClient.invalidateQueries({
        queryKey: versionKeys.all(workflowId),
      })
    },
    gcTime: 0,
  })
}

export function usePublishWorkflow(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['workflow', 'publish', workflowId],
    mutationFn: async (payload: PublishWorkflowPayload) => {
      const response = await apiClient
        .post(`workflow-definitions/${workflowId}/publish`, {
          json: toSnakeBody(payload),
        })
        .json<ApiResponse<WorkflowVersion>>()
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(workflowId),
      })
      queryClient.invalidateQueries({
        queryKey: versionKeys.all(workflowId),
      })
    },
    gcTime: 0,
  })
}

export function useArchiveWorkflow(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['workflow', 'archive', workflowId],
    mutationFn: async () => {
      await apiClient.post(`workflow-definitions/${workflowId}/archive`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(workflowId),
      })
      queryClient.invalidateQueries({
        queryKey: versionKeys.all(workflowId),
      })
    },
    gcTime: 0,
  })
}
