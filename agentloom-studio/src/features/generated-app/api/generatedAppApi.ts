import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type {
  CreateGeneratedAppPayload,
  GeneratedApp,
  GeneratedAppListResponse,
  ListGeneratedAppsParams,
  RecordGeneratedAppGateResultsPayload,
} from '../types'

const GENERATED_APPS_PATH = 'generated-apps'

function buildGeneratedAppSearchParams(params: ListGeneratedAppsParams) {
  const searchParams: Record<string, string> = {}

  if (params.page !== undefined) {
    searchParams.page = String(params.page)
  }

  if (params.pageSize !== undefined) {
    searchParams.pageSize = String(params.pageSize)
  }

  if (params.status) {
    searchParams.status = params.status
  }

  return searchParams
}

export async function createGeneratedApp(
  payload: CreateGeneratedAppPayload,
): Promise<GeneratedApp> {
  const response = await apiClient
    .post(GENERATED_APPS_PATH, { json: { prompt: payload.prompt } })
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

export async function listGeneratedApps(
  params: ListGeneratedAppsParams = {},
): Promise<GeneratedAppListResponse> {
  return apiClient
    .get(GENERATED_APPS_PATH, {
      searchParams: buildGeneratedAppSearchParams(params),
    })
    .json<GeneratedAppListResponse>()
}

export async function getGeneratedApp(appId: string): Promise<GeneratedApp> {
  const response = await apiClient
    .get(`${GENERATED_APPS_PATH}/${appId}`)
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

export async function recordGeneratedAppGateResults(
  appId: string,
  payload: RecordGeneratedAppGateResultsPayload,
): Promise<GeneratedApp> {
  const response = await apiClient
    .patch(`${GENERATED_APPS_PATH}/${appId}/gates`, { json: payload })
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

export async function enableGeneratedAppPublicShare(
  appId: string,
): Promise<GeneratedApp> {
  const response = await apiClient
    .post(`${GENERATED_APPS_PATH}/${appId}/public-share`)
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

export async function regenerateGeneratedAppPublicShare(
  appId: string,
): Promise<GeneratedApp> {
  const response = await apiClient
    .post(`${GENERATED_APPS_PATH}/${appId}/public-share/regenerate`)
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}

export async function disableGeneratedAppPublicShare(
  appId: string,
): Promise<GeneratedApp> {
  const response = await apiClient
    .delete(`${GENERATED_APPS_PATH}/${appId}/public-share`)
    .json<ApiResponse<GeneratedApp>>()

  return response.data
}
