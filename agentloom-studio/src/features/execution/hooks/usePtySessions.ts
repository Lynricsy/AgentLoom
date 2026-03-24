import { useQuery } from '@tanstack/react-query'
import { fetchPtySessions, ptyKeys } from '../api/pty'
import type { PtySessionInfo } from '../types/pty'

export interface UsePtySessionsOptions {
  executionId: string
  enabled?: boolean
}

export function usePtySessions(options: UsePtySessionsOptions) {
  const { executionId, enabled = true } = options

  return useQuery<PtySessionInfo[]>({
    queryKey: ptyKeys.sessions(executionId),
    queryFn: () => fetchPtySessions(executionId),
    enabled: enabled && !!executionId,
  })
}
