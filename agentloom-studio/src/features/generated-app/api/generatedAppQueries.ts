import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  getGeneratedApp,
  listGeneratedApps,
} from './generatedAppApi'
import { generatedAppKeys } from './generatedAppKeys'
import type { ListGeneratedAppsParams } from '../types'

const GENERATED_APP_STALE_TIME = 30_000

export function useGeneratedApps(params: ListGeneratedAppsParams = {}) {
  return useQuery({
    queryKey: generatedAppKeys.list(params),
    queryFn: () => listGeneratedApps(params),
    placeholderData: keepPreviousData,
    staleTime: GENERATED_APP_STALE_TIME,
  })
}

export function useGeneratedApp(appId: string | undefined) {
  return useQuery({
    queryKey: generatedAppKeys.detail(appId ?? ''),
    queryFn: () => getGeneratedApp(appId ?? ''),
    enabled: !!appId,
    staleTime: GENERATED_APP_STALE_TIME,
  })
}
