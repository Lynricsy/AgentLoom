import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createPlatformApiToken,
  fetchPlatformApiTokens,
  revokePlatformApiToken,
} from './platformApiTokenApi'
import { platformApiTokenKeys } from './platformApiTokenKeys'
import type {
  CreatePlatformApiTokenInput,
  ListPlatformApiTokensParams,
} from '../types'

const TOKEN_STALE_TIME = 30 * 1000

export function usePlatformApiTokens(params: ListPlatformApiTokensParams = {}) {
  return useQuery({
    queryKey: platformApiTokenKeys.list(params as Record<string, unknown>),
    queryFn: () => fetchPlatformApiTokens(params),
    staleTime: TOKEN_STALE_TIME,
  })
}

export function useCreatePlatformApiToken() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...platformApiTokenKeys.all, 'create'],
    mutationFn: (input: CreatePlatformApiTokenInput) =>
      createPlatformApiToken(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: platformApiTokenKeys.lists(),
      })
    },
    // 明文 token 不进 react-query 缓存，避免被 devtools/持久化捡走
    gcTime: 0,
  })
}

export function useRevokePlatformApiToken() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...platformApiTokenKeys.all, 'revoke'],
    mutationFn: (tokenId: string) => revokePlatformApiToken(tokenId),
    onSettled: async () => {
      // 409（已撤销）同样需要刷新列表，让本地视图与服务端对齐
      await queryClient.invalidateQueries({
        queryKey: platformApiTokenKeys.lists(),
      })
    },
    gcTime: 0,
  })
}
