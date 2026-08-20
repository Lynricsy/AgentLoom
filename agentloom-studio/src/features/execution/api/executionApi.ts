import type {
  ExecutionEnvelopeResponseSwaggerDto,
  ExecutionEnvelopeResponseSwaggerDtoData,
  ExecutionEnvelopeResponseSwaggerDtoDataErrorMessage,
  ExecutionEnvelopeResponseSwaggerDtoDataErrorMessageAttemptsInner,
  ExecutionEnvelopeResponseSwaggerDtoDataStepsInner,
  ExecutionListResponseSwaggerDto,
  InterveneStepDto,
  ResolveToolPermissionDto,
  RunWorkflowDto,
  RunWorkflowDtoLaunchSourceEnum,
} from '@agentloom/api-client'
import type { ApiResponse } from '@/shared/types/api'
import { apiClient, toSnakeBody } from '@/shared/api/client'

export type ExecutionLaunchSource = RunWorkflowDtoLaunchSourceEnum

export type ExecutionStepAttemptResponse =
  ExecutionEnvelopeResponseSwaggerDtoDataErrorMessageAttemptsInner

export type ExecutionStepErrorResponse =
  ExecutionEnvelopeResponseSwaggerDtoDataErrorMessage

/** 服务端执行步骤响应（经 snake→camel 自动转换后） */
export type ExecutionStepResponse =
  ExecutionEnvelopeResponseSwaggerDtoDataStepsInner

/** 服务端执行记录响应（经 snake→camel 自动转换后） */
export type ExecutionResponse = ExecutionEnvelopeResponseSwaggerDtoData

export interface ListExecutionsParams {
  page?: number
  pageSize?: number
  status?: string
}

/** POST /executions/:id/steps/:stepId/intervene 请求体（生成模型） */
export type InterventionResolveRequest = InterveneStepDto

export interface InterventionResolveResponse {
  executionId: string
  stepId: string
  status: 'intervention_accepted'
}

/**
 * POST /workflow-definitions/:id/run 请求体（生成模型）。
 * `inputParams` 收窄为 `Record<string, unknown>`：生成产物在这里是无约束索引签名，
 * 而调用方只需要能写入任意值，`unknown` 足够且不放弃类型检查。
 */
export type RunWorkflowRequest = Omit<RunWorkflowDto, 'inputParams'> & {
  inputParams?: Record<string, unknown>
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
    .json<ExecutionEnvelopeResponseSwaggerDto>()
}

/** 获取执行详情 — GET /executions/:id */
export async function getExecution(executionId: string) {
  return apiClient
    .get(`executions/${executionId}`)
    .json<ExecutionEnvelopeResponseSwaggerDto>()
}

export async function listExecutions(
  workflowDefinitionId: string,
  params?: ListExecutionsParams,
): Promise<ExecutionListResponseSwaggerDto> {
  return apiClient
    .get(`workflow-definitions/${workflowDefinitionId}/executions`, {
      searchParams: params
        ? Object.fromEntries(
            Object.entries(params).filter(([, value]) => value != null),
          )
        : undefined,
    })
    .json<ExecutionListResponseSwaggerDto>()
}

/** 取消执行 — POST /executions/:id/cancel */
export async function cancelExecution(executionId: string) {
  return apiClient
    .post(`executions/${executionId}/cancel`)
    .json<ExecutionEnvelopeResponseSwaggerDto>()
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

/** POST /executions/:id/steps/:stepId/tool-calls/:toolCallId/permission 请求体（生成模型） */
export type ToolPermissionResolveRequest = ResolveToolPermissionDto

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
