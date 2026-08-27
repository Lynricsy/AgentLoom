import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type { MemoryNode, MemoryEdge, MemoryNodeVersion } from './types'

const BASE_PATH = 'memory-instances'

// --- Query key factory ---

export const memoryGraphKeys = {
  all: ['memory-graph'] as const,
  graph: (instanceId: string) =>
    [...memoryGraphKeys.all, 'graph', instanceId] as const,
  nodeDetail: (instanceId: string, nodeId: string) =>
    [...memoryGraphKeys.all, 'node', instanceId, nodeId] as const,
  nodeVersions: (instanceId: string, nodeId: string) =>
    [...memoryGraphKeys.all, 'versions', instanceId, nodeId] as const,
}

// --- API functions ---

export async function fetchMemoryNodes(
  instanceId: string,
): Promise<MemoryNode[]> {
  // ky 已统一挂载 /api/v1，使用资源相对路径可避免生产请求出现双前缀。
  const res = await apiClient
    .get(`${BASE_PATH}/${instanceId}/nodes`)
    .json<ApiResponse<MemoryNode[]>>()
  return res.data
}

export async function fetchMemoryEdges(
  instanceId: string,
): Promise<MemoryEdge[]> {
  // 列表端点返回分页信封，图谱只消费其中的数据数组。
  const res = await apiClient
    .get(`${BASE_PATH}/${instanceId}/edges`)
    .json<ApiResponse<MemoryEdge[]>>()
  return res.data
}

export async function fetchMemoryNodeDetail(
  instanceId: string,
  nodeId: string,
): Promise<MemoryNode> {
  const res = await apiClient
    .get(`${BASE_PATH}/${instanceId}/nodes/${nodeId}`)
    .json<ApiResponse<MemoryNode>>()
  return res.data
}

export async function fetchMemoryNodeVersions(
  instanceId: string,
  nodeId: string,
): Promise<MemoryNodeVersion[]> {
  // 版本历史同样是分页信封，不能把整个响应误当成数组交给组件。
  const res = await apiClient
    .get(`${BASE_PATH}/${instanceId}/nodes/${nodeId}/versions`)
    .json<ApiResponse<MemoryNodeVersion[]>>()
  return res.data
}

// --- Query hooks ---

export function useMemoryGraph(instanceId: string) {
  return useQuery({
    queryKey: memoryGraphKeys.graph(instanceId),
    queryFn: async () => {
      const [nodes, edges] = await Promise.all([
        fetchMemoryNodes(instanceId),
        fetchMemoryEdges(instanceId),
      ])
      return { nodes, edges }
    },
    enabled: !!instanceId,
    staleTime: 30_000,
  })
}

export function useMemoryNodeDetail(
  instanceId: string,
  nodeId: string | null,
) {
  return useQuery({
    queryKey: memoryGraphKeys.nodeDetail(instanceId, nodeId ?? ''),
    queryFn: () => fetchMemoryNodeDetail(instanceId, nodeId!),
    enabled: !!instanceId && !!nodeId,
    staleTime: 30_000,
  })
}

export function useMemoryNodeVersions(
  instanceId: string,
  nodeId: string | null,
) {
  return useQuery({
    queryKey: memoryGraphKeys.nodeVersions(instanceId, nodeId ?? ''),
    queryFn: () => fetchMemoryNodeVersions(instanceId, nodeId!),
    enabled: !!instanceId && !!nodeId,
    staleTime: 30_000,
  })
}
