import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/shared/api/client'
import type { PaginatedResponse } from '@/shared/types/api'

export interface MemoryInstance {
  id: string
  name: string
  description?: string
  status: string
  graphEngine: string
  createdAt: string
  updatedAt: string
}

export const memoryInstanceKeys = {
  all: ['memory-instances'] as const,
  lists: () => [...memoryInstanceKeys.all, 'list'] as const,
  allOptions: () => [...memoryInstanceKeys.lists(), 'all-options'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...memoryInstanceKeys.lists(), filters] as const,
  details: () => [...memoryInstanceKeys.all, 'detail'] as const,
  detail: (id: string) => [...memoryInstanceKeys.details(), id] as const,
}

const BASE_PATH = 'memory-instances'

async function fetchMemoryInstances(params?: {
  page?: number
  pageSize?: number
}): Promise<PaginatedResponse<MemoryInstance>> {
  const searchParams: Record<string, string> = {}
  if (params?.page) searchParams.page = String(params.page)
  if (params?.pageSize) searchParams.page_size = String(params.pageSize)

  return apiClient
    .get(BASE_PATH, { searchParams })
    .json<PaginatedResponse<MemoryInstance>>()
}

async function fetchAllMemoryInstances(
  pageSize = 100,
): Promise<MemoryInstance[]> {
  const instances: MemoryInstance[] = []
  let page = 1
  let totalPages = 1

  do {
    const response = await fetchMemoryInstances({ page, pageSize })
    instances.push(...response.data)
    totalPages = response.meta.totalPages
    page += 1
  } while (page <= totalPages)

  return instances
}

export function useAllMemoryInstances(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: memoryInstanceKeys.allOptions(),
    queryFn: () => fetchAllMemoryInstances(),
    enabled: options?.enabled ?? true,
  })
}
