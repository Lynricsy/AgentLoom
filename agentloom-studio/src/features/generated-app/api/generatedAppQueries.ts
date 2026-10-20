import { useEffect, useRef } from 'react'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getGeneratedApp,
  getGeneratedAppArtifactContent,
  getGeneratedAppArtifactManifest,
  getGeneratedAppRuntimeBindingReadiness,
  getGeneratedAppSubmission,
  getGeneratedAppPublicSubmission,
  getGeneratedAppPublicRuntime,
  getGeneratedAppGenerationRun,
  listGeneratedAppGateRuns,
  listGeneratedAppGenerationRuns,
  listGeneratedAppRepairAttempts,
  listGeneratedAppSubmissions,
  listGeneratedApps,
} from './generatedAppApi'
import { generatedAppKeys } from './generatedAppKeys'
import type {
  GeneratedAppGenerationRunStatus,
  GeneratedAppSubmissionStatus,
  ListGeneratedAppGateRunsParams,
  ListGeneratedAppGenerationRunsParams,
  ListGeneratedAppRepairAttemptsParams,
  ListGeneratedAppSubmissionsParams,
  ListGeneratedAppsParams,
} from '../types'

const GENERATED_APP_STALE_TIME = 30_000
const GENERATED_APP_SUBMISSION_POLL_INTERVAL_MS = 2_000
const GENERATED_APP_GENERATION_POLL_INTERVAL_MS = 3_000

/** 提交在执行结束前保持 received/running；服务端在读取时按执行状态刷新结果 */
function isSubmissionInFlight(
  submission: { status: GeneratedAppSubmissionStatus } | undefined,
): boolean {
  return submission?.status === 'received' || submission?.status === 'running'
}

/** 排队、执行或修复中的运行还会推进 Gate；进入终态后不再变化 */
export function isGeneratedAppGenerationRunInFlight(
  run: { status: GeneratedAppGenerationRunStatus } | undefined,
): boolean {
  return (
    run?.status === 'queued' ||
    run?.status === 'running' ||
    run?.status === 'repairing'
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

export function useGeneratedAppRuntimeBindingReadiness(
  appId: string | undefined,
) {
  return useQuery({
    queryKey: generatedAppKeys.runtimeBindingReadiness(appId ?? ''),
    queryFn: () => getGeneratedAppRuntimeBindingReadiness(appId ?? ''),
    enabled: !!appId,
    staleTime: GENERATED_APP_STALE_TIME,
  })
}

export function useGeneratedAppArtifactManifest(appId: string | undefined) {
  return useQuery({
    queryKey: generatedAppKeys.artifactManifest(appId ?? ''),
    queryFn: () => getGeneratedAppArtifactManifest(appId ?? ''),
    enabled: !!appId,
    staleTime: GENERATED_APP_STALE_TIME,
  })
}

export function useGeneratedAppArtifactContent(
  appId: string | undefined,
  artifactId: string | undefined,
) {
  return useQuery({
    queryKey: generatedAppKeys.artifactContent(appId ?? '', artifactId ?? ''),
    queryFn: () =>
      getGeneratedAppArtifactContent(appId ?? '', artifactId ?? ''),
    enabled: !!appId && !!artifactId,
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

/**
 * 轮询单次生成运行直到终态。Gate 0–7 在 worker 中异步执行，每完成一个 Gate 服务端都会改写运行
 * summary（updatedAt 前进）并更新应用的 gateResults/状态：运行有推进时刷新应用详情与列表，
 * 进入终态时刷新该应用的全部子资源（readiness、artifact、运行与 Gate 列表）。
 */
export function useGeneratedAppGenerationRun(
  appId: string | undefined,
  generationRunId: string | undefined,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: generatedAppKeys.generationRunDetail(
      appId ?? '',
      generationRunId ?? '',
    ),
    queryFn: () =>
      getGeneratedAppGenerationRun(appId ?? '', generationRunId ?? ''),
    enabled: !!appId && !!generationRunId,
    refetchInterval: (current) =>
      isGeneratedAppGenerationRunInFlight(current.state.data)
        ? GENERATED_APP_GENERATION_POLL_INTERVAL_MS
        : false,
  })
  const run = query.data
  const lastSeenRef = useRef<{
    id: string
    updatedAt: string
    inFlight: boolean
  } | null>(null)

  useEffect(() => {
    if (!appId || !run) {
      return
    }

    const previous = lastSeenRef.current
    const inFlight = isGeneratedAppGenerationRunInFlight(run)
    lastSeenRef.current = { id: run.id, updatedAt: run.updatedAt, inFlight }

    if (
      !previous ||
      previous.id !== run.id ||
      previous.updatedAt === run.updatedAt
    ) {
      return
    }

    void queryClient.invalidateQueries({
      queryKey: generatedAppKeys.detail(appId),
      exact: !(previous.inFlight && !inFlight),
    })
    void queryClient.invalidateQueries({ queryKey: generatedAppKeys.lists() })
  }, [appId, queryClient, run])

  return query
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
  options: { poll?: boolean } = {},
) {
  return useQuery({
    queryKey: generatedAppKeys.gateRunList(appId ?? '', params),
    queryFn: () => listGeneratedAppGateRuns(appId ?? '', params),
    enabled: !!appId,
    placeholderData: keepPreviousData,
    staleTime: GENERATED_APP_STALE_TIME,
    refetchInterval: options.poll
      ? GENERATED_APP_GENERATION_POLL_INTERVAL_MS
      : false,
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
    staleTime: 0,
    refetchInterval: (query) =>
      isSubmissionInFlight(query.state.data)
        ? GENERATED_APP_SUBMISSION_POLL_INTERVAL_MS
        : false,
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
      isSubmissionInFlight(query.state.data)
        ? GENERATED_APP_SUBMISSION_POLL_INTERVAL_MS
        : false,
  })
}
