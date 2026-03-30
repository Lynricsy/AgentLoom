import { apiClient } from '@/shared/api/client'
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api'
import type {
  CreateTriggerData,
  ListTriggersParams,
  Trigger,
  TriggerHistoryParams,
  TriggerHistoryRecord,
  TriggerHistoryResult,
  TriggerListResult,
  UpdateTriggerData,
} from '../types'

type TriggerListResponse =
  | ApiResponse<Trigger[]>
  | PaginatedResponse<Trigger>
  | TriggerListResult
  | Trigger[]

type TriggerDetailResponse = ApiResponse<Trigger> | Trigger

type TriggerHistoryResponse =
  | ApiResponse<TriggerHistoryRecord[]>
  | PaginatedResponse<TriggerHistoryRecord>
  | TriggerHistoryResult
  | TriggerHistoryRecord[]

function unwrapTrigger(response: TriggerDetailResponse): Trigger {
  if ('data' in response) {
    return response.data
  }

  return response
}

function normalizeTriggerListResponse(response: TriggerListResponse): TriggerListResult {
  if (Array.isArray(response)) {
    return { data: response }
  }

  if ('meta' in response) {
    return {
      data: response.data,
      meta: response.meta,
    }
  }

  return {
    data: response.data,
  }
}

function normalizeTriggerHistoryResponse(
  response: TriggerHistoryResponse,
  fallback: Required<Pick<TriggerHistoryParams, 'page' | 'pageSize'>>,
): TriggerHistoryResult {
  if (Array.isArray(response)) {
    return {
      data: response,
      meta: {
        page: fallback.page,
        pageSize: fallback.pageSize,
        total: response.length,
        totalPages: response.length > 0 ? 1 : 0,
      },
    }
  }

  if ('meta' in response) {
    return response
  }

  return {
    data: response.data,
    meta: {
      page: fallback.page,
      pageSize: fallback.pageSize,
      total: response.data.length,
      totalPages: response.data.length > 0 ? 1 : 0,
    },
  }
}

export async function fetchTriggers(
  workflowId: string,
  params: ListTriggersParams = {},
): Promise<TriggerListResult> {
  const searchParams: Record<string, string> = {}

  if (params.type) {
    searchParams.type = params.type
  }

  const response = await apiClient
    .get(`workflow-definitions/${workflowId}/triggers`, { searchParams })
    .json<TriggerListResponse>()

  return normalizeTriggerListResponse(response)
}

export async function fetchTriggerById(
  workflowId: string,
  triggerId: string,
): Promise<Trigger> {
  const response = await apiClient
    .get(`workflow-definitions/${workflowId}/triggers/${triggerId}`)
    .json<TriggerDetailResponse>()

  return unwrapTrigger(response)
}

export async function createTrigger(
  workflowId: string,
  data: CreateTriggerData,
): Promise<Trigger> {
  const response = await apiClient
    .post(`workflow-definitions/${workflowId}/triggers`, {
      // Trigger config fields are validated as camelCase by the current server contract.
      json: data,
    })
    .json<TriggerDetailResponse>()

  return unwrapTrigger(response)
}

export async function updateTrigger(
  workflowId: string,
  triggerId: string,
  data: UpdateTriggerData,
): Promise<Trigger> {
  const response = await apiClient
    .patch(`workflow-definitions/${workflowId}/triggers/${triggerId}`, {
      // Trigger config fields are validated as camelCase by the current server contract.
      json: data,
    })
    .json<TriggerDetailResponse>()

  return unwrapTrigger(response)
}

export async function deleteTrigger(
  workflowId: string,
  triggerId: string,
): Promise<void> {
  await apiClient.delete(`workflow-definitions/${workflowId}/triggers/${triggerId}`)
}

export async function toggleTrigger(
  workflowId: string,
  triggerId: string,
): Promise<Trigger> {
  const response = await apiClient
    .patch(`workflow-definitions/${workflowId}/triggers/${triggerId}/toggle`)
    .json<TriggerDetailResponse>()

  return unwrapTrigger(response)
}

export async function fetchTriggerHistory(
  workflowId: string,
  triggerId: string,
  params: TriggerHistoryParams = {},
): Promise<TriggerHistoryResult> {
  const searchParams: Record<string, string> = {}

  if (params.page) {
    searchParams.page = String(params.page)
  }

  if (params.pageSize) {
    searchParams.pageSize = String(params.pageSize)
  }

  if (params.status) {
    searchParams.status = params.status
  }

  const response = await apiClient
    .get(`workflow-definitions/${workflowId}/triggers/${triggerId}/history`, {
      searchParams,
    })
    .json<TriggerHistoryResponse>()

  return normalizeTriggerHistoryResponse(response, {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
  })
}
