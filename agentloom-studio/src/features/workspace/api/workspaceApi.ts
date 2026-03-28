import { apiClient } from '@/shared/api/client'
import type {
  Workspace,
  WorkspaceListResponse,
  WorkspaceListParams,
  CreateWorkspacePayload,
} from '../types'

interface ApiEnvelope<T> {
  data: T
}

const BASE_PATH = 'workspaces'

export async function fetchWorkspaces(
  params?: WorkspaceListParams,
): Promise<WorkspaceListResponse> {
  const searchParams: Record<string, string | number> = {}
  if (params?.page) searchParams.page = params.page
  if (params?.pageSize) searchParams.pageSize = params.pageSize
  if (params?.search) searchParams.search = params.search

  return apiClient
    .get(BASE_PATH, { searchParams })
    .json<WorkspaceListResponse>()
}

export async function fetchAllWorkspaces(): Promise<Workspace[]> {
  const response = await apiClient
    .get(BASE_PATH, { searchParams: { pageSize: 1000 } })
    .json<WorkspaceListResponse>()
  return response.data
}

export async function fetchWorkspaceDetail(id: string): Promise<Workspace> {
  const response = await apiClient
    .get(`${BASE_PATH}/${id}`)
    .json<ApiEnvelope<Workspace>>()
  return response.data
}

export async function createWorkspace(
  payload: CreateWorkspacePayload,
): Promise<Workspace> {
  const response = await apiClient
    .post(BASE_PATH, { json: { ...payload, createEmpty: true } })
    .json<ApiEnvelope<Workspace>>()
  return response.data
}

export async function deleteWorkspace(id: string): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${id}`)
}
