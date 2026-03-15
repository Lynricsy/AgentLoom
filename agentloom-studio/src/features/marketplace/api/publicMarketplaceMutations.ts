import { useMutation, useQueryClient } from '@tanstack/react-query'

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: publicMarketplaceKeys.all,
      })
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
