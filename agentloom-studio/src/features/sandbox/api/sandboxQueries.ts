import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import {
  fetchSandboxes,
  fetchSandboxStats,
  fetchPersistentSandboxes,
} from './sandboxApi'
import { sandboxKeys } from './sandboxKeys'
import type {
  SandboxListParams,
  SandboxListResponse,
  SandboxStats,
  SandboxStatus,
} from '../types'

const TRANSITIONAL_STATUSES: ReadonlySet<SandboxStatus> = new Set([
  'creating',
  'stopping',
])

const RUNNING_STATUSES: ReadonlySet<SandboxStatus> = new Set([
  'ready',
  'busy',
])

export function useSandboxes(params?: SandboxListParams) {
  return useQuery({
    queryKey: sandboxKeys.list(params),
    queryFn: () => fetchSandboxes(params),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: (query) => {
      const data = query.state.data as SandboxListResponse | undefined
      const hasTransitioningSession =
        data?.data.some((session) => TRANSITIONAL_STATUSES.has(session.status)) ??
        false

      return hasTransitioningSession ? 3_000 : false
    },
  })
}

export function useSandboxStats(
  sessionId: string,
  status?: SandboxStatus,
) {
  const isRunning = status ? RUNNING_STATUSES.has(status) : false

  return useQuery({
    queryKey: sandboxKeys.stats(sessionId),
    queryFn: async (): Promise<SandboxStats | null> => {
      try {
        return await fetchSandboxStats(sessionId)
      } catch (error) {
        if (
          error instanceof HTTPError &&
          (error.response.status === 404 || error.response.status === 409)
        ) {
          return null
        }

        throw error
      }
    },
    enabled: Boolean(sessionId) && isRunning,
    refetchInterval: isRunning ? 5_000 : false,
    staleTime: 4_000,
    retry: false,
  })
}

export function usePersistentSandboxes() {
  return useQuery({
    queryKey: sandboxKeys.persistent(),
    queryFn: fetchPersistentSandboxes,
    staleTime: 30_000,
  })
}
