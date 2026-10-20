import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import {
  createGeneratedAppPublicSubmission,
  createGeneratedApp,
  deleteGeneratedAppSubmission,
  deleteGeneratedAppSubmissions,
  disableGeneratedAppPublicShare,
  enableGeneratedAppPublicShare,
  recordGeneratedAppGateResults,
  regenerateGeneratedAppPublicShare,
  startGeneratedAppGenerationRun,
} from './generatedAppApi'
import { generatedAppKeys } from './generatedAppKeys'
import type {
  CreateGeneratedAppPublicSubmissionPayload,
  CreateGeneratedAppPayload,
  CreatedGeneratedApp,
  DeleteGeneratedAppSubmissionsResponse,
  GeneratedApp,
  GeneratedAppPublicSubmission,
  RecordGeneratedAppGateResultsPayload,
  StartGeneratedAppGenerationRunPayload,
  StartGeneratedAppGenerationRunResponse,
} from '../types'

interface StartGeneratedAppGenerationRunVariables extends StartGeneratedAppGenerationRunPayload {
  appId?: string
}

function syncGeneratedAppQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  app: GeneratedApp,
) {
  queryClient.setQueryData(generatedAppKeys.detail(app.id), app)
  queryClient.invalidateQueries({ queryKey: generatedAppKeys.lists() })
  queryClient.invalidateQueries({
    queryKey: generatedAppKeys.runtimeBindingReadiness(app.id),
  })
  queryClient.invalidateQueries({
    queryKey: generatedAppKeys.artifactManifest(app.id),
  })
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

function invalidateGeneratedAppRunQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  appId: string,
  generationRunId?: string,
) {
  queryClient.invalidateQueries({
    queryKey: generatedAppKeys.generationRunLists(appId),
  })
  queryClient.invalidateQueries({
    queryKey: generatedAppKeys.gateRunLists(appId),
  })

  if (generationRunId) {
    queryClient.invalidateQueries({
      queryKey: generatedAppKeys.repairAttemptLists(appId, generationRunId),
    })
  }
}

/** 创建即排队 initial 生成运行；调用方用响应里的 generationRunId 轮询，不再调用 start（会得到 409） */
export function useCreateGeneratedApp() {
  const queryClient = useQueryClient()

  return useMutation<CreatedGeneratedApp, Error, CreateGeneratedAppPayload>({
    mutationKey: [...generatedAppKeys.all, 'create'],
    mutationFn: createGeneratedApp,
    gcTime: 0,
    onSuccess: (app) => {
      syncGeneratedAppQueries(queryClient, app)
    },
  })
}

/**
 * 排队一次生成运行：成功是 HTTP 202 + queued 运行，Gate 结果靠轮询运行详情；
 * 409 表示已有进行中的运行，同样刷新运行列表，让页面接上那次运行的进度。
 */
export function useStartGeneratedAppGenerationRun(defaultAppId?: string) {
  const queryClient = useQueryClient()

  return useMutation<
    StartGeneratedAppGenerationRunResponse,
    Error,
    StartGeneratedAppGenerationRunVariables | undefined
  >({
    mutationKey: [
      ...generatedAppKeys.all,
      'generation-runs',
      'start',
      defaultAppId ?? 'dynamic',
    ],
    mutationFn: (payload) => {
      const appId = payload?.appId ?? defaultAppId

      if (!appId) {
        throw new Error('Generated app id is required to start generation.')
      }

      const body: StartGeneratedAppGenerationRunPayload = {
        triggerSource: payload?.triggerSource,
        maxRepairAttempts: payload?.maxRepairAttempts,
        maxRuntimeSeconds: payload?.maxRuntimeSeconds,
        regenerateAppSpec: payload?.regenerateAppSpec,
      }

      return startGeneratedAppGenerationRun(appId, body)
    },
    gcTime: 0,
    onSuccess: (response) => {
      syncGeneratedAppQueries(queryClient, response.app)
      invalidateGeneratedAppRunQueries(
        queryClient,
        response.app.id,
        response.generationRun.id,
      )
    },
    onError: (error, payload) => {
      const appId = payload?.appId ?? defaultAppId

      if (appId && error instanceof HTTPError && error.response.status === 409) {
        invalidateGeneratedAppRunQueries(queryClient, appId)
      }
    },
  })
}

export function useRecordGeneratedAppGateResults(appId: string) {
  const queryClient = useQueryClient()

  return useMutation<GeneratedApp, Error, RecordGeneratedAppGateResultsPayload>(
    {
      mutationKey: [...generatedAppKeys.detail(appId), 'record-gates'],
      mutationFn: (payload) => recordGeneratedAppGateResults(appId, payload),
      gcTime: 0,
      onSuccess: (app) => {
        syncGeneratedAppQueries(queryClient, app)
      },
    },
  )
}

export function useCreateGeneratedAppPublicSubmission(token: string) {
  const queryClient = useQueryClient()

  return useMutation<
    GeneratedAppPublicSubmission,
    Error,
    CreateGeneratedAppPublicSubmissionPayload
  >({
    mutationKey: [...generatedAppKeys.publicRuntime(token), 'submit'],
    mutationFn: (payload) => createGeneratedAppPublicSubmission(token, payload),
    gcTime: 0,
    onSuccess: (submission) => {
      queryClient.setQueryData(
        generatedAppKeys.publicSubmission(token, submission.id),
        submission,
      )
      queryClient.invalidateQueries({
        queryKey: generatedAppKeys.publicSubmission(token, submission.id),
      })
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
