import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  getGeneratedApp,
  getGeneratedAppSubmission,
  getGeneratedAppPublicRuntime,
  listGeneratedAppSubmissions,
  listGeneratedApps,
} from './generatedAppApi'
import { generatedAppKeys } from './generatedAppKeys'
import type {
  ListGeneratedAppSubmissionsParams,
  ListGeneratedAppsParams,
} from '../types'

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

export function useGeneratedAppSubmissions(
  appId: string | undefined,
  params: ListGeneratedAppSubmissionsParams = {},
) {
  return useQuery({
    queryKey: generatedAppKeys.submissionList(appId ?? '', params),
    queryFn: () => listGeneratedAppSubmissions(appId ?? '', params),
    enabled: !!appId,
    placeholderData: keepPreviousData,
    staleTime: GENERATED_APP_STALE_TIME,
  })
}

export function useGeneratedAppSubmission(
  appId: string | undefined,
  submissionId: string | undefined,
) {
  return useQuery({
    queryKey: generatedAppKeys.submissionDetail(
      appId ?? '',
      submissionId ?? '',
    ),
    queryFn: () => getGeneratedAppSubmission(appId ?? '', submissionId ?? ''),
    enabled: !!appId && !!submissionId,
    staleTime: GENERATED_APP_STALE_TIME,
  })
}

export function useGeneratedAppPublicRuntime(token: string | undefined) {
  return useQuery({
    queryKey: generatedAppKeys.publicRuntime(token ?? ''),
    queryFn: () => getGeneratedAppPublicRuntime(token ?? ''),
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60_000,
  })
}
