import type { SandboxListParams } from '../types'

export const sandboxKeys = {
  all: ['sandboxes'] as const,
  lists: () => [...sandboxKeys.all, 'list'] as const,
  list: (params?: SandboxListParams) => [...sandboxKeys.lists(), params] as const,
  stats: (sessionId: string) => [...sandboxKeys.all, 'stats', sessionId] as const,
  persistent: () => [...sandboxKeys.all, 'persistent'] as const,
}
