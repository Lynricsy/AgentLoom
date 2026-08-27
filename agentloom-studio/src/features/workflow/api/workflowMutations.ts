import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  UpdateWorkflowPayload,
  WorkflowImportPayload,
} from '../types'
import { workflowKeys } from './workflowKeys'
import { createWorkflow, exportWorkflow, importWorkflow, validateImport } from './workflowApi'
import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type { WorkflowDefinition, WorkflowImportFileContent } from '../types'

export function useUpdateWorkflow(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['workflow', 'save', id],
    mutationFn: async (payload: UpdateWorkflowPayload) => {
      const response = await apiClient
        .patch(`workflow-definitions/${id}`, {
          // server 的 strict DTO 只接受 camelCase，转换后会把合法字段变成未知键并返回 422。
          json: payload,
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
    mutationFn: createWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() })
    },
    gcTime: 0,
  })
}

export function useExportWorkflow() {
  return useMutation({
    mutationKey: ['workflow', 'export'],
    mutationFn: (workflowId: string) => exportWorkflow(workflowId),
    gcTime: 0,
  })
}

export function useValidateImport() {
  return useMutation({
    mutationKey: ['workflow', 'import', 'validate'],
    mutationFn: (fileContent: WorkflowImportFileContent) => validateImport(fileContent),
    gcTime: 0,
  })
}

export function useImportWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['workflow', 'import'],
    mutationFn: (payload: WorkflowImportPayload) => importWorkflow(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() })
    },
    gcTime: 0,
  })
}
