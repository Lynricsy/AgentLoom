import {
  useQuery,
  keepPreviousData,
} from '@tanstack/react-query';
import { HTTPError } from 'ky';

import { conversationKeys } from './conversationKeys';
import {
  fetchConversationSandboxStats,
  listConversations,
  type ListConversationsParams,
} from './conversationApi';
import type { SandboxStats } from '@/features/sandbox/types';
import type { SandboxStatus } from '../types';

export function useConversationList(
  agentId: string,
  params: ListConversationsParams = {},
) {
  return useQuery({
    queryKey: conversationKeys.list(agentId, params as Record<string, unknown>),
    queryFn: () => listConversations(agentId, params),
    placeholderData: keepPreviousData,
    enabled: !!agentId,
  });
}

export function useConversationSandboxStats(
  conversationId: string | null | undefined,
  sandboxStatus: SandboxStatus,
) {
  return useQuery({
    queryKey: conversationId
      ? conversationKeys.sandboxStats(conversationId)
      : [...conversationKeys.all, 'sandbox-stats', 'empty'],
    queryFn: async (): Promise<SandboxStats | null> => {
      if (!conversationId) {
        return null
      }

      try {
        return await fetchConversationSandboxStats(conversationId)
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
    enabled: Boolean(conversationId) && sandboxStatus !== 'error',
    refetchInterval: sandboxStatus === 'running' ? 5_000 : false,
    staleTime: 4_000,
    retry: false,
  })
}
