import type {
  ListGeneratedAppGateRunsParams,
  ListGeneratedAppGenerationRunsParams,
  ListGeneratedAppRepairAttemptsParams,
  ListGeneratedAppsParams,
  ListGeneratedAppSubmissionsParams,
} from '../types'

export const generatedAppKeys = {
  all: ['generated-apps'] as const,
  lists: () => [...generatedAppKeys.all, 'list'] as const,
  list: (filters?: ListGeneratedAppsParams) =>
    [...generatedAppKeys.lists(), filters] as const,
  details: () => [...generatedAppKeys.all, 'detail'] as const,
  detail: (appId: string) => [...generatedAppKeys.details(), appId] as const,
  runtimeBindingReadiness: (appId: string) =>
    [...generatedAppKeys.detail(appId), 'runtime-binding-readiness'] as const,
  publicShare: (appId: string) =>
    [...generatedAppKeys.detail(appId), 'public-share'] as const,
  generationRunLists: (appId: string) =>
    [...generatedAppKeys.detail(appId), 'generation-runs', 'list'] as const,
  generationRunList: (
    appId: string,
    filters?: ListGeneratedAppGenerationRunsParams,
  ) => [...generatedAppKeys.generationRunLists(appId), filters] as const,
  repairAttemptLists: (appId: string, generationRunId: string) =>
    [
      ...generatedAppKeys.detail(appId),
      'generation-runs',
      generationRunId,
      'repair-attempts',
      'list',
    ] as const,
  repairAttemptList: (
    appId: string,
    generationRunId: string,
    filters?: ListGeneratedAppRepairAttemptsParams,
  ) =>
    [
      ...generatedAppKeys.repairAttemptLists(appId, generationRunId),
      filters,
    ] as const,
  gateRunLists: (appId: string) =>
    [...generatedAppKeys.detail(appId), 'gate-runs', 'list'] as const,
  gateRunList: (appId: string, filters?: ListGeneratedAppGateRunsParams) =>
    [...generatedAppKeys.gateRunLists(appId), filters] as const,
  submissionLists: (appId: string) =>
    [...generatedAppKeys.detail(appId), 'submissions', 'list'] as const,
  submissionList: (
    appId: string,
    filters?: ListGeneratedAppSubmissionsParams,
  ) => [...generatedAppKeys.submissionLists(appId), filters] as const,
  submissionDetails: (appId: string) =>
    [...generatedAppKeys.detail(appId), 'submissions', 'detail'] as const,
  submissionDetail: (appId: string, submissionId: string) =>
    [...generatedAppKeys.submissionDetails(appId), submissionId] as const,
  publicRuntime: (token: string) =>
    [...generatedAppKeys.all, 'public-runtime', token] as const,
  publicSubmission: (token: string, submissionId: string) =>
    [
      ...generatedAppKeys.publicRuntime(token),
      'submission',
      submissionId,
    ] as const,
}
