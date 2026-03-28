import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchWorkspaces,
  fetchWorkspaceDetail,
  fetchAllWorkspaces,
} from './workspaceApi'
import { workspaceKeys } from './workspaceKeys'
import type { WorkspaceListParams } from '../types'

export function useWorkspaces(params?: WorkspaceListParams) {
  return useQuery({
    queryKey: workspaceKeys.list(params),
    queryFn: () => fetchWorkspaces(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

export function useWorkspaceDetail(
  id: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: workspaceKeys.detail(id),
    queryFn: () => fetchWorkspaceDetail(id),
    enabled: options?.enabled ?? Boolean(id),
    staleTime: 30_000,
  })
}

export function useAllWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.lists(),
    queryFn: fetchAllWorkspaces,
    staleTime: 30_000,
  })
}
