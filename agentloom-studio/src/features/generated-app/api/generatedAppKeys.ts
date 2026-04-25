import type { ListGeneratedAppsParams } from '../types'

export const generatedAppKeys = {
  all: ['generated-apps'] as const,
  lists: () => [...generatedAppKeys.all, 'list'] as const,
  list: (filters?: ListGeneratedAppsParams) =>
    [...generatedAppKeys.lists(), filters] as const,
  details: () => [...generatedAppKeys.all, 'detail'] as const,
  detail: (appId: string) => [...generatedAppKeys.details(), appId] as const,
  publicShare: (appId: string) =>
    [...generatedAppKeys.detail(appId), 'public-share'] as const,
}
