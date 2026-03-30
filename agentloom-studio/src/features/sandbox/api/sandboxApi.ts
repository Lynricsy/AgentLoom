import { apiClient } from '@/shared/api/client'
import type {
  SandboxSession,
  SandboxStats,
  SandboxListResponse,
  SandboxListParams,
  CreateSandboxPayload,
} from '../types'

interface ApiEnvelope<T> {
  data: T
}

const BASE_PATH = 'sandboxes'
const PERSISTENT_SANDBOX_PAGE_SIZE = 100

export async function fetchSandboxes(
  params?: SandboxListParams,
): Promise<SandboxListResponse> {
  const searchParams: Record<string, string | number> = {}
  if (params?.page) searchParams.page = params.page
  if (params?.pageSize) searchParams.pageSize = params.pageSize
  if (params?.status) searchParams.status = params.status
  if (params?.lifecycleMode) searchParams.lifecycleMode = params.lifecycleMode
  if (params?.search) searchParams.search = params.search

  return apiClient
    .get(BASE_PATH, { searchParams })
    .json<SandboxListResponse>()
}

export async function fetchPersistentSandboxes(): Promise<SandboxSession[]> {
  const response = await apiClient
    .get(BASE_PATH, {
      searchParams: {
        lifecycleMode: 'persistent',
        pageSize: PERSISTENT_SANDBOX_PAGE_SIZE,
      },
    })
    .json<SandboxListResponse>()
  return response.data
}

export async function fetchSandboxStats(sessionId: string): Promise<SandboxStats> {
  const response = await apiClient
    .get(`${BASE_PATH}/${sessionId}/stats`)
    .json<ApiEnvelope<SandboxStats>>()
  return response.data
}

export async function createSandbox(
  payload: CreateSandboxPayload,
): Promise<SandboxSession> {
  const response = await apiClient
    .post(BASE_PATH, { json: payload })
    .json<ApiEnvelope<SandboxSession>>()
  return response.data
}

export async function stopSandbox(sessionId: string): Promise<void> {
  await apiClient.post(`${BASE_PATH}/${sessionId}/stop`)
}

export async function startSandbox(sessionId: string): Promise<void> {
  await apiClient.post(`${BASE_PATH}/${sessionId}/start`)
}

export async function deleteSandbox(sessionId: string): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${sessionId}`)
}
