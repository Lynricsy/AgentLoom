import { useMutation, useQueryClient } from '@tanstack/react-query'

import { pluginKeys } from '@/features/plugin'
import {
  installMarketplaceListing,
  submitMarketplaceReview,
  uninstallMarketplaceListing,
  upgradeMarketplaceListing,
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

/**
 * 停用来自某个 listing 的插件副本。
 *
 * 与安装对称地失效两棵缓存：插件库里那几行状态变了（pluginKeys），
 * 市场侧的安装态展示也随之过期（publicMarketplaceKeys）。
 * 升级检查挂在 pluginKeys.detail 下，跟着 pluginKeys.all 一起失效。
 */
export function useUninstallListing() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (listingId: string) => uninstallMarketplaceListing(listingId),
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

/** 把已安装副本升级到 listing 当前版本；副本行被整行重写，缓存同卸载一并失效 */
export function useUpgradeListing() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (listingId: string) => upgradeMarketplaceListing(listingId),
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
