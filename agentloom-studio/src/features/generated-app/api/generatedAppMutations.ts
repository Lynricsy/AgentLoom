import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createGeneratedApp,
  disableGeneratedAppPublicShare,
  enableGeneratedAppPublicShare,
  recordGeneratedAppGateResults,
  regenerateGeneratedAppPublicShare,
} from './generatedAppApi'
import { generatedAppKeys } from './generatedAppKeys'
import type {
  CreateGeneratedAppPayload,
  GeneratedApp,
  RecordGeneratedAppGateResultsPayload,
} from '../types'

function syncGeneratedAppQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  app: GeneratedApp,
) {
  queryClient.setQueryData(generatedAppKeys.detail(app.id), app)
  queryClient.invalidateQueries({ queryKey: generatedAppKeys.lists() })
}

export function useCreateGeneratedApp() {
  const queryClient = useQueryClient()

  return useMutation<GeneratedApp, Error, CreateGeneratedAppPayload>({
    mutationKey: [...generatedAppKeys.all, 'create'],
    mutationFn: createGeneratedApp,
    gcTime: 0,
    onSuccess: (app) => {
      syncGeneratedAppQueries(queryClient, app)
    },
  })
}

export function useRecordGeneratedAppGateResults(appId: string) {
  const queryClient = useQueryClient()

  return useMutation<GeneratedApp, Error, RecordGeneratedAppGateResultsPayload>({
    mutationKey: [...generatedAppKeys.detail(appId), 'record-gates'],
    mutationFn: (payload) => recordGeneratedAppGateResults(appId, payload),
    gcTime: 0,
    onSuccess: (app) => {
      syncGeneratedAppQueries(queryClient, app)
    },
  })
}

export function useEnableGeneratedAppPublicShare(appId: string) {
  const queryClient = useQueryClient()

  return useMutation<GeneratedApp, Error, void>({
    mutationKey: [...generatedAppKeys.publicShare(appId), 'enable'],
    mutationFn: () => enableGeneratedAppPublicShare(appId),
    gcTime: 0,
    onSuccess: (app) => {
      syncGeneratedAppQueries(queryClient, app)
    },
  })
}

export function useRegenerateGeneratedAppPublicShare(appId: string) {
  const queryClient = useQueryClient()

  return useMutation<GeneratedApp, Error, void>({
    mutationKey: [...generatedAppKeys.publicShare(appId), 'regenerate'],
    mutationFn: () => regenerateGeneratedAppPublicShare(appId),
    gcTime: 0,
    onSuccess: (app) => {
      syncGeneratedAppQueries(queryClient, app)
    },
  })
}

export function useDisableGeneratedAppPublicShare(appId: string) {
  const queryClient = useQueryClient()

  return useMutation<GeneratedApp, Error, void>({
    mutationKey: [...generatedAppKeys.publicShare(appId), 'disable'],
    mutationFn: () => disableGeneratedAppPublicShare(appId),
    gcTime: 0,
    onSuccess: (app) => {
      syncGeneratedAppQueries(queryClient, app)
    },
  })
}
