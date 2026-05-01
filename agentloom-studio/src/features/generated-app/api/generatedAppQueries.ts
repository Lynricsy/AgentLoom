import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  getGeneratedApp,
  getGeneratedAppSubmission,
  getGeneratedAppPublicSubmission,
  getGeneratedAppPublicRuntime,
  listGeneratedAppGateRuns,
  listGeneratedAppGenerationRuns,
  listGeneratedAppRepairAttempts,
  listGeneratedAppSubmissions,
  listGeneratedApps,
} from './generatedAppApi'
import { generatedAppKeys } from './generatedAppKeys'
import type {
  ListGeneratedAppGateRunsParams,
  ListGeneratedAppGenerationRunsParams,
  ListGeneratedAppRepairAttemptsParams,
  ListGeneratedAppSubmissionsParams,
  ListGeneratedAppsParams,
  GeneratedAppPublicSubmission,
} from '../types'

const GENERATED_APP_STALE_TIME = 30_000
const GENERATED_APP_PUBLIC_SUBMISSION_POLL_INTERVAL_MS = 2_000

function isWorkflowExecutionPollingSubmission(
  submission: GeneratedAppPublicSubmission | undefined,
): boolean {
  const handoff =
    submission?.report?.workflowExecution === true
      ? submission.report
      : submission?.result?.workflowExecution === true
        ? submission.result
        : null

  return (
    handoff !== null &&
    (handoff.executionStatus === 'pending' ||
      handoff.executionStatus === 'running')
  )
}

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

export function useGeneratedAppGenerationRuns(
  appId: string | undefined,
  params: ListGeneratedAppGenerationRunsParams = {},
) {
  return useQuery({
    queryKey: generatedAppKeys.generationRunList(appId ?? '', params),
    queryFn: () => listGeneratedAppGenerationRuns(appId ?? '', params),
    enabled: !!appId,
    placeholderData: keepPreviousData,
    staleTime: GENERATED_APP_STALE_TIME,
  })
}

export function useGeneratedAppRepairAttempts(
  appId: string | undefined,
  generationRunId: string | undefined,
  params: ListGeneratedAppRepairAttemptsParams = {},
) {
  return useQuery({
    queryKey: generatedAppKeys.repairAttemptList(
      appId ?? '',
      generationRunId ?? '',
      params,
    ),
    queryFn: () =>
      listGeneratedAppRepairAttempts(
        appId ?? '',
        generationRunId ?? '',
        params,
      ),
    enabled: !!appId && !!generationRunId,
    placeholderData: keepPreviousData,
    staleTime: GENERATED_APP_STALE_TIME,
  })
}

export function useGeneratedAppGateRuns(
  appId: string | undefined,
  params: ListGeneratedAppGateRunsParams = {},
) {
  return useQuery({
    queryKey: generatedAppKeys.gateRunList(appId ?? '', params),
    queryFn: () => listGeneratedAppGateRuns(appId ?? '', params),
    enabled: !!appId,
    placeholderData: keepPreviousData,
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

export function useGeneratedAppPublicSubmission(
  token: string | undefined,
  submissionId: string | undefined,
) {
  return useQuery({
    queryKey: generatedAppKeys.publicSubmission(
      token ?? '',
      submissionId ?? '',
    ),
    queryFn: () =>
      getGeneratedAppPublicSubmission(token ?? '', submissionId ?? ''),
    enabled: !!token && !!submissionId,
    retry: false,
    staleTime: 0,
    refetchInterval: (query) =>
      isWorkflowExecutionPollingSubmission(query.state.data)
        ? GENERATED_APP_PUBLIC_SUBMISSION_POLL_INTERVAL_MS
        : false,
  })
}
