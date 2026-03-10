import type { ApiResponse, PaginatedResponse } from '@/shared/types/api'
import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ExecutionStatus } from '../types'

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
  errorMessage?: string | { message?: string | null } | null
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

/** 启动工作流执行 — POST /workflow-definitions/:workflowId/run → 202 */
export async function runWorkflow(
  workflowId: string,
  inputParams?: Record<string, unknown>,
) {
  return apiClient
    .post(`workflow-definitions/${workflowId}/run`, {
      json: inputParams ? toSnakeBody({ inputParams }) : undefined,
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
