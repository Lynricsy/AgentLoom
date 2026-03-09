import type { ApiResponse } from '@/shared/types/api'
import { apiClient, toSnakeBody } from '@/shared/api/client'
import type { ExecutionStatus } from '../types'

/** 服务端执行记录响应（经 snake→camel 自动转换后） */
export interface ExecutionResponse {
  id: string
  tenantId: string
  workflowDefinitionId: string
  workflowVersionId: string | null
  status: ExecutionStatus
  inputParams: Record<string, unknown> | null
  result: Record<string, unknown> | null
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
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
