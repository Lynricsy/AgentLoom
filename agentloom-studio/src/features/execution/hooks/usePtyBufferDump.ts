import { useQuery } from '@tanstack/react-query'
import { fetchPtyBufferDump, ptyKeys } from '../api/pty'
import type { PtyBufferDumpResponse } from '../types/pty'

export interface UsePtyBufferDumpOptions {
  executionId: string
  sessionId: string
  enabled?: boolean
}

export function usePtyBufferDump(options: UsePtyBufferDumpOptions) {
  const { executionId, sessionId, enabled = true } = options

  return useQuery<PtyBufferDumpResponse>({
    queryKey: ptyKeys.bufferDump(executionId, sessionId),
    queryFn: () => fetchPtyBufferDump(executionId, sessionId),
    enabled: enabled && !!executionId && !!sessionId,
  })
}
