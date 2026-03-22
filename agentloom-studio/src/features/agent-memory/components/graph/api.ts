import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type { MemoryNode, MemoryEdge, MemoryNodeVersion } from './types'

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

async function fetchMemoryNodes(
  instanceId: string,
): Promise<MemoryNode[]> {
  const res = await apiClient
    .get(`api/v1/memory-instances/${instanceId}/nodes`)
    .json<ApiResponse<MemoryNode[]>>()
  return res.data
}

async function fetchMemoryEdges(
  instanceId: string,
): Promise<MemoryEdge[]> {
  const res = await apiClient
    .get(`api/v1/memory-instances/${instanceId}/edges`)
    .json<ApiResponse<MemoryEdge[]>>()
  return res.data
}

async function fetchMemoryNodeDetail(
  instanceId: string,
  nodeId: string,
): Promise<MemoryNode> {
  const res = await apiClient
    .get(`api/v1/memory-instances/${instanceId}/nodes/${nodeId}`)
    .json<ApiResponse<MemoryNode>>()
  return res.data
}

async function fetchMemoryNodeVersions(
  instanceId: string,
  nodeId: string,
): Promise<MemoryNodeVersion[]> {
  const res = await apiClient
    .get(`api/v1/memory-instances/${instanceId}/nodes/${nodeId}/versions`)
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
