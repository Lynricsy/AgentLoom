import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  createAgentApiKey,
  fetchAgentApiKeys,
  revokeAgentApiKey,
} from './agentApiKeyApi'
import { agentApiKeyKeys } from './agentApiKeyKeys'
import type { CreateAgentApiKeyInput, ListAgentApiKeysParams } from '../types'

const KEY_STALE_TIME = 30 * 1000

export function useAgentApiKeys(
  agentId: string,
  params: ListAgentApiKeysParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: agentApiKeyKeys.list(agentId, params as Record<string, unknown>),
    queryFn: () => fetchAgentApiKeys(agentId, params),
    staleTime: KEY_STALE_TIME,
    placeholderData: keepPreviousData,
    enabled: Boolean(agentId) && (options.enabled ?? true),
  })
}

export function useCreateAgentApiKey(agentId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...agentApiKeyKeys.all, 'create', agentId],
    mutationFn: (input: CreateAgentApiKeyInput) =>
      createAgentApiKey(agentId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: agentApiKeyKeys.agentLists(agentId),
      })
    },
    // 明文 key 不进 react-query 缓存，避免被 devtools/持久化捡走
    gcTime: 0,
  })
}

export function useRevokeAgentApiKey(agentId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...agentApiKeyKeys.all, 'revoke', agentId],
    mutationFn: (keyId: string) => revokeAgentApiKey(agentId, keyId),
    onSettled: async () => {
      // 失败（如 404）同样刷新，让本地视图与服务端对齐
      await queryClient.invalidateQueries({
        queryKey: agentApiKeyKeys.agentLists(agentId),
      })
    },
  })
}
