import { useMutation, useQueryClient } from '@tanstack/react-query'

import { pluginKeys } from '@/features/plugin'
import {
  installMarketplaceListing,
  submitMarketplaceReview,
} from './publicMarketplaceApi'
import { publicMarketplaceKeys } from './marketplaceKeys'
import type {
  InstallMarketplaceListingRequest,
  SubmitReviewRequest,
} from '../types'

export function useInstallListing() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body?: InstallMarketplaceListingRequest
    }) => installMarketplaceListing(id, body),
    // 插件安装会往租户插件库里写一行：一并失效插件 feature 的缓存，
    // NodePalette 与插件管理页无需刷新即可看到新节点。
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: publicMarketplaceKeys.all,
        }),
        queryClient.invalidateQueries({ queryKey: pluginKeys.all }),
      ])
    },
  })
}

export function useSubmitReview() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      listingId,
      body,
    }: {
      listingId: string
      body: SubmitReviewRequest
    }) => submitMarketplaceReview(listingId, body),
    onSuccess: async (_data, { listingId }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: publicMarketplaceKeys.detail(listingId),
        }),
        queryClient.invalidateQueries({
          queryKey: publicMarketplaceKeys.reviews(listingId),
        }),
      ])
    },
  })
}
