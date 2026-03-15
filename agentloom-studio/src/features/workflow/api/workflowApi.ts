import { apiClient, toSnakeBody } from '../../../shared/api/client'
import type { ApiResponse } from '../../../shared/types/api'
import type {
  CreateWorkflowPayload,
  ImportValidationResult,
  ImportWorkflowResult,
  WorkflowDefinition,
  WorkflowExportEnvelope,
  WorkflowImportFileContent,
  WorkflowImportPayload,
} from '../types'

export async function createWorkflow(payload: CreateWorkflowPayload) {
  const response = await apiClient
    .post('workflow-definitions', {
      json: toSnakeBody(payload),
    })
    .json<ApiResponse<WorkflowDefinition>>()

  return response.data
}

export async function exportWorkflow(workflowId: string): Promise<WorkflowExportEnvelope> {
  return apiClient
    .get(`workflow-definitions/${workflowId}/export`)
    .json<WorkflowExportEnvelope>()
}

export async function validateImport(
  fileContent: WorkflowImportFileContent,
): Promise<ImportValidationResult> {
  return apiClient
    .post('workflow-definitions/import/validate', {
      json: toSnakeBody(fileContent),
    })
    .json<ImportValidationResult>()
}

export async function importWorkflow(
  payload: WorkflowImportPayload,
): Promise<ImportWorkflowResult> {
  return apiClient
    .post('workflow-definitions/import', {
      json: toSnakeBody(payload),
    })
    .json<ImportWorkflowResult>()
}
