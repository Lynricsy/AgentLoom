import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchMemoryInstances,
  fetchMemoryInstanceDetail,
  fetchAllMemoryInstances,
} from './memoryInstanceApi'
import { memoryInstanceKeys } from './memoryInstanceKeys'
import type { MemoryInstanceListParams } from '../types'

export function useMemoryInstances(params?: MemoryInstanceListParams) {
  return useQuery({
    queryKey: memoryInstanceKeys.list(params),
    queryFn: () => fetchMemoryInstances(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

export function useMemoryInstanceDetail(
  id: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: memoryInstanceKeys.detail(id),
    queryFn: () => fetchMemoryInstanceDetail(id),
    enabled: options?.enabled ?? Boolean(id),
    staleTime: 30_000,
  })
}

export function useAllMemoryInstances() {
  return useQuery({
    queryKey: memoryInstanceKeys.lists(),
    queryFn: fetchAllMemoryInstances,
    staleTime: 30_000,
  })
}
