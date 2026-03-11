import { apiClient, toSnakeBody } from '../../../shared/api/client'
import type { ApiResponse } from '../../../shared/types/api'
import type { CreateWorkflowPayload, WorkflowDefinition } from '../types'

export async function createWorkflow(payload: CreateWorkflowPayload) {
  const response = await apiClient
    .post('workflow-definitions', {
      json: toSnakeBody(payload),
    })
    .json<ApiResponse<WorkflowDefinition>>()

  return response.data
}
