import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchSandboxes,
  fetchSandboxStats,
  fetchPersistentSandboxes,
} from './sandboxApi'
import { sandboxKeys } from './sandboxKeys'
import type { SandboxListParams, SandboxStatus } from '../types'

const RUNNING_STATUSES: ReadonlySet<SandboxStatus> = new Set([
  'creating',
  'ready',
  'busy',
])

export function useSandboxes(params?: SandboxListParams) {
  return useQuery({
    queryKey: sandboxKeys.list(params),
    queryFn: () => fetchSandboxes(params),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}

export function useSandboxStats(
  sessionId: string,
  status?: SandboxStatus,
) {
  const isRunning = status ? RUNNING_STATUSES.has(status) : false

  return useQuery({
    queryKey: sandboxKeys.stats(sessionId),
    queryFn: () => fetchSandboxStats(sessionId),
    enabled: Boolean(sessionId) && isRunning,
    refetchInterval: isRunning ? 5_000 : false,
    staleTime: 4_000,
  })
}

export function usePersistentSandboxes() {
  return useQuery({
    queryKey: sandboxKeys.persistent(),
    queryFn: fetchPersistentSandboxes,
    staleTime: 30_000,
  })
}
