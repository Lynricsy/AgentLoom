import type {
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
  publicShare: (appId: string) =>
    [...generatedAppKeys.detail(appId), 'public-share'] as const,
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
