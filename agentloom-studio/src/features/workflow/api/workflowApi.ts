import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  CreateWorkflowPayload,
  ImportValidationResult,
  ImportWorkflowResult,
  ListWorkflowsParams,
  WorkflowDefinition,
  WorkflowExportEnvelope,
  WorkflowImportFileContent,
  WorkflowImportPayload,
  WorkflowListResponse,
} from '../types'

export async function listWorkflows(params: ListWorkflowsParams = {}) {
  const searchParams: Record<string, string> = {}
  if (params.page) searchParams.page = String(params.page)
  if (params.pageSize) searchParams.pageSize = String(params.pageSize)
  if (params.status) searchParams.status = params.status
  if (params.search) searchParams.search = params.search

  return apiClient
    .get('workflow-definitions', { searchParams })
    .json<WorkflowListResponse>()
}

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
