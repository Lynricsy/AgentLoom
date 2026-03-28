import { apiClient } from '@/shared/api/client'
import type {
  MemoryInstance,
  MemoryInstanceDetail,
  MemoryInstanceListResponse,
  MemoryInstanceListParams,
  CreateMemoryInstancePayload,
  UpdateMemoryInstancePayload,
} from '../types'

interface ApiEnvelope<T> {
  data: T
}

const BASE_PATH = 'memory-instances'

export async function fetchMemoryInstances(
  params?: MemoryInstanceListParams,
): Promise<MemoryInstanceListResponse> {
  const searchParams: Record<string, string | number> = {}
  if (params?.page) searchParams.page = params.page
  if (params?.pageSize) searchParams.pageSize = params.pageSize
  if (params?.search) searchParams.search = params.search
  if (params?.status) searchParams.status = params.status

  return apiClient
    .get(BASE_PATH, { searchParams })
    .json<MemoryInstanceListResponse>()
}

export async function fetchAllMemoryInstances(): Promise<MemoryInstance[]> {
  const response = await apiClient
    .get(BASE_PATH, { searchParams: { pageSize: 1000 } })
    .json<MemoryInstanceListResponse>()
  return response.data
}

export async function fetchMemoryInstanceDetail(
  id: string,
): Promise<MemoryInstanceDetail> {
  const response = await apiClient
    .get(`${BASE_PATH}/${id}`)
    .json<ApiEnvelope<MemoryInstanceDetail>>()
  return response.data
}

export async function createMemoryInstance(
  payload: CreateMemoryInstancePayload,
): Promise<MemoryInstance> {
  const response = await apiClient
    .post(BASE_PATH, { json: payload })
    .json<ApiEnvelope<MemoryInstance>>()
  return response.data
}

export async function updateMemoryInstance(
  id: string,
  payload: UpdateMemoryInstancePayload,
): Promise<MemoryInstance> {
  const response = await apiClient
    .patch(`${BASE_PATH}/${id}`, { json: payload })
    .json<ApiEnvelope<MemoryInstance>>()
  return response.data
}

export async function deleteMemoryInstance(id: string): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${id}`)
}
