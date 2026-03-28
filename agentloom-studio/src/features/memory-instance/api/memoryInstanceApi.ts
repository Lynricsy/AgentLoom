import { apiClient } from '@/shared/api/client'
import type {
  MemoryInstance,
  MemoryInstanceDetail,
  MemoryInstanceListResponse,
  MemoryInstanceListParams,
  CreateMemoryInstancePayload,
  UpdateMemoryInstancePayload,
  BrowseData,
  MemoryDomain,
  MemoryNode,
  MemoryNodeVersion,
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

// --- Browse API ---

export async function browseMemoryNode(
  instanceId: string,
  params: { domain: string; path?: string; navOnly?: boolean },
): Promise<BrowseData> {
  const searchParams: Record<string, string> = {
    uri: `${params.domain}://${params.path ?? ''}`,
  }
  if (params.navOnly) searchParams.nav_only = 'true'
  const response = await apiClient
    .get(`${BASE_PATH}/${instanceId}/browse`, { searchParams })
    .json<ApiEnvelope<BrowseData>>()
  return response.data
}

export async function fetchMemoryDomains(
  instanceId: string,
): Promise<MemoryDomain[]> {
  const response = await apiClient
    .get(`${BASE_PATH}/${instanceId}/domains`)
    .json<ApiEnvelope<MemoryDomain[]>>()
  return response.data
}

export async function searchMemoryNodes(
  instanceId: string,
  query: string,
): Promise<MemoryNode[]> {
  const response = await apiClient
    .get(`${BASE_PATH}/${instanceId}/search`, { searchParams: { q: query } })
    .json<ApiEnvelope<MemoryNode[]>>()
  return response.data
}

export async function fetchNodeVersions(
  instanceId: string,
  nodeId: string,
): Promise<MemoryNodeVersion[]> {
  const response = await apiClient
    .get(`${BASE_PATH}/${instanceId}/nodes/${nodeId}/versions`)
    .json<ApiEnvelope<MemoryNodeVersion[]>>()
  return response.data
}

export async function createNodeVersion(
  instanceId: string,
  nodeId: string,
  payload: { content?: string; priority?: number; disclosure?: string; mode?: string },
): Promise<MemoryNodeVersion> {
  const response = await apiClient
    .post(`${BASE_PATH}/${instanceId}/nodes/${nodeId}/versions`, { json: payload })
    .json<ApiEnvelope<MemoryNodeVersion>>()
  return response.data
}

export async function rollbackNodeVersion(
  instanceId: string,
  nodeId: string,
  versionId: string,
): Promise<void> {
  await apiClient.post(`${BASE_PATH}/${instanceId}/nodes/${nodeId}/rollback`, {
    json: { targetVersionId: versionId },
  })
}

export async function addGlossaryKeyword(
  instanceId: string,
  nodeId: string,
  keyword: string,
): Promise<void> {
  await apiClient.post(`${BASE_PATH}/${instanceId}/nodes/${nodeId}/glossary`, {
    json: { keyword },
  })
}

export async function removeGlossaryKeyword(
  instanceId: string,
  nodeId: string,
  keyword: string,
): Promise<void> {
  await apiClient.delete(`${BASE_PATH}/${instanceId}/nodes/${nodeId}/glossary`, {
    json: { keyword },
  })
}
