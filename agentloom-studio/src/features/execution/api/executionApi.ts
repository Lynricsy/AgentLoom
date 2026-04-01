import type { ApiResponse, PaginatedResponse } from '@/shared/types/api'
import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ExecutionStatus, TypeMismatchInfo } from '../types'

export type ExecutionLaunchSource = 'web-studio' | 'mobile' | 'api'

export interface ExecutionStepAttemptResponse {
  attempt: number
  error?: string
  message?: string
  timestamp: string
}

export interface ExecutionStepErrorResponse {
  message?: string | null
  title?: string | null
  detail?: string | null
  type?: string | null
  nodeId?: string | null
  stack?: string
  errors?: Array<{ field: string; message: string }>
  typeMismatch?: TypeMismatchInfo
  attempts?: ExecutionStepAttemptResponse[]
}

/** 服务端执行记录响应（经 snake→camel 自动转换后） */
export interface ExecutionStepResponse {
  id: string
  executionId: string
  nodeId: string
  stepOrder: number
  status:
    | 'pending'
    | 'queued'
    | 'running'
    | 'waiting_intervention'
    | 'waiting_for_intervention'
    | 'completed'
    | 'failed'
    | 'skipped'
    | 'cancelled'
  input?: Record<string, unknown> | null
  nodeType?: string | null
  nodeData?: Record<string, unknown> | null
  result?: Record<string, unknown> | null
  checkpointData?: Record<string, unknown> | null
  errorMessage?: string | ExecutionStepErrorResponse | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ExecutionResponse {
  id: string
  tenantId: string
  workflowDefinitionId: string
  workflowId?: string
  workflowVersionId: string | null
  status: ExecutionStatus
  triggerType?: 'manual' | 'api' | 'webhook' | 'system' | 'scheduled'
  inputParams: Record<string, unknown> | null
  result: Record<string, unknown> | null
  definitionSnapshot?: {
    nodes: unknown[]
    edges: unknown[]
    viewport?: unknown | null
    metadata?: Record<string, unknown>
  } | null
  workflowVersion?: {
    id?: string
    graph?: {
      nodes?: unknown[]
      edges?: unknown[]
    }
  } | null
  startedAt: string | null
  completedAt: string | null
  failedAt?: string | null
  cancelledAt?: string | null
  errorMessage: string | null
  totalSteps?: number
  completedSteps?: number
  createdBy?: string
  createdAt: string
  updatedAt: string
  steps?: ExecutionStepResponse[]
}

export interface ListExecutionsParams {
  page?: number
  pageSize?: number
  status?: string
}

export interface InterventionResolveRequest {
  action: 'approve' | 'modify' | 'reject'
  feedback?: string
  modifiedContent?: string
}

export interface InterventionResolveResponse {
  executionId: string
  stepId: string
  status: 'intervention_accepted'
}

export interface RunWorkflowRequest {
  inputParams?: Record<string, unknown>
  schemaVersion?: number
  launchSource?: ExecutionLaunchSource
}

/** 启动工作流执行 — POST /workflow-definitions/:workflowId/run → 202 */
export async function runWorkflow(
  workflowId: string,
  payload?: RunWorkflowRequest,
) {
  const hasPayload =
    payload?.inputParams !== undefined ||
    payload?.schemaVersion !== undefined ||
    payload?.launchSource !== undefined

  return apiClient
    .post(`workflow-definitions/${workflowId}/run`, {
      json: hasPayload ? toSnakeBody(payload) : undefined,
    })
    .json<ApiResponse<ExecutionResponse>>()
}

/** 获取执行详情 — GET /executions/:id */
export async function getExecution(executionId: string) {
  return apiClient
    .get(`executions/${executionId}`)
    .json<ApiResponse<ExecutionResponse>>()
}

export async function listExecutions(
  workflowDefinitionId: string,
  params?: ListExecutionsParams,
): Promise<PaginatedResponse<ExecutionResponse>> {
  return apiClient
    .get(`workflow-definitions/${workflowDefinitionId}/executions`, {
      searchParams: params
        ? Object.fromEntries(
            Object.entries(params).filter(([, value]) => value != null),
          )
        : undefined,
    })
    .json()
}

/** 取消执行 — POST /executions/:id/cancel */
export async function cancelExecution(executionId: string) {
  return apiClient
    .post(`executions/${executionId}/cancel`)
    .json<ApiResponse<ExecutionResponse>>()
}

/** 人工干预处理 — POST /executions/:id/steps/:stepId/intervene → 202 */
export async function resolveIntervention(
  executionId: string,
  stepId: string,
  body: InterventionResolveRequest,
) {
  return apiClient
    .post(`executions/${executionId}/steps/${stepId}/intervene`, {
      json: toSnakeBody(body),
    })
    .json<ApiResponse<InterventionResolveResponse>>()
}

export interface ToolPermissionResolveRequest {
  action: 'approve' | 'deny'
}

export interface ExecutionWorkspaceFileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: ExecutionWorkspaceFileNode[]
}

export interface ExecutionWorkspaceFileContent {
  path: string
  content: string
  size: number
  encoding: 'utf-8'
}

export async function resolveToolPermission(
  executionId: string,
  stepId: string,
  toolCallId: string,
  body: ToolPermissionResolveRequest,
) {
  return apiClient
    .post(
      `executions/${executionId}/steps/${stepId}/tool-calls/${toolCallId}/resolve`,
      { json: toSnakeBody(body) },
    )
    .json<void>()
}

export async function getExecutionStepWorkspaceTree(
  executionId: string,
  stepId: string,
) {
  return apiClient
    .get(`executions/${executionId}/steps/${stepId}/workspace/tree`)
    .json<ExecutionWorkspaceFileNode[]>()
}

export async function getExecutionStepWorkspaceFile(
  executionId: string,
  stepId: string,
  filePath: string,
) {
  const encodedPath = encodeURIComponent(filePath)
    .replaceAll('%2F', '/')
    .replaceAll('%5C', '/')

  return apiClient
    .get(`executions/${executionId}/steps/${stepId}/workspace/files/${encodedPath}`)
    .json<ExecutionWorkspaceFileContent>()
}
