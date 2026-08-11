import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchDeveloperKeys,
  registerDeveloperKey,
  revokeDeveloperKey,
} from './developer-key.api'
import type { DeveloperKeyListParams } from '../types'

const DEVELOPER_KEY_STALE_TIME = 30 * 1000

export const developerKeyKeys = {
  all: ['developer-keys'] as const,
  lists: () => [...developerKeyKeys.all, 'list'] as const,
  list: (params: DeveloperKeyListParams) =>
    [...developerKeyKeys.lists(), params] as const,
}

export function useDeveloperKeys(params: DeveloperKeyListParams) {
  return useQuery({
    queryKey: developerKeyKeys.list(params),
    queryFn: () => fetchDeveloperKeys(params),
    staleTime: DEVELOPER_KEY_STALE_TIME,
  })
}

export function useRegisterDeveloperKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: registerDeveloperKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: developerKeyKeys.lists() })
    },
  })
}

export function useRevokeDeveloperKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: revokeDeveloperKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: developerKeyKeys.lists() })
    },
  })
}
