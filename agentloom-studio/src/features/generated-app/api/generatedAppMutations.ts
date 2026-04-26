import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createGeneratedApp,
  deleteGeneratedAppSubmission,
  deleteGeneratedAppSubmissions,
  disableGeneratedAppPublicShare,
  enableGeneratedAppPublicShare,
  recordGeneratedAppGateResults,
  regenerateGeneratedAppPublicShare,
} from './generatedAppApi'
import { generatedAppKeys } from './generatedAppKeys'
import type {
  CreateGeneratedAppPayload,
  DeleteGeneratedAppSubmissionsResponse,
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

function invalidateGeneratedAppSubmissionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  appId: string,
) {
  queryClient.invalidateQueries({
    queryKey: generatedAppKeys.submissionLists(appId),
  })
  queryClient.invalidateQueries({
    queryKey: generatedAppKeys.submissionDetails(appId),
  })
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

export function useDeleteGeneratedAppSubmission(appId: string) {
  const queryClient = useQueryClient()

  return useMutation<DeleteGeneratedAppSubmissionsResponse, Error, string>({
    mutationKey: [...generatedAppKeys.detail(appId), 'delete-submission'],
    mutationFn: (submissionId) =>
      deleteGeneratedAppSubmission(appId, submissionId),
    gcTime: 0,
    onSuccess: (_response, submissionId) => {
      queryClient.removeQueries({
        queryKey: generatedAppKeys.submissionDetail(appId, submissionId),
      })
      invalidateGeneratedAppSubmissionQueries(queryClient, appId)
    },
  })
}

export function useDeleteGeneratedAppSubmissions(appId: string) {
  const queryClient = useQueryClient()

  return useMutation<DeleteGeneratedAppSubmissionsResponse, Error, string[]>({
    mutationKey: [...generatedAppKeys.detail(appId), 'delete-submissions'],
    mutationFn: (ids) => deleteGeneratedAppSubmissions(appId, ids),
    gcTime: 0,
    onSuccess: (_response, ids) => {
      ids.forEach((submissionId) => {
        queryClient.removeQueries({
          queryKey: generatedAppKeys.submissionDetail(appId, submissionId),
        })
      })
      invalidateGeneratedAppSubmissionQueries(queryClient, appId)
    },
  })
}
