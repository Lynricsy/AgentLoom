import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  relistMarketplaceListing,
  submitMarketplaceListing,
  unlistMarketplaceListing,
} from './marketplaceApi';
import { marketplaceKeys } from './marketplaceKeys';
import type { SubmitMarketplaceListingRequest } from '../types';

export function useSubmitMarketplaceListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...marketplaceKeys.all, 'submit'],
    mutationFn: (request: SubmitMarketplaceListingRequest) =>
      submitMarketplaceListing(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: marketplaceKeys.lists() });
    },
    gcTime: 0,
  });
}

export function useUnlistMarketplaceListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...marketplaceKeys.all, 'unlist'],
    mutationFn: (listingId: string) => unlistMarketplaceListing(listingId),
    onSuccess: async (_data, listingId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: marketplaceKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: marketplaceKeys.detail(listingId),
        }),
      ]);
    },
    gcTime: 0,
  });
}

export function useRelistMarketplaceListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...marketplaceKeys.all, 'relist'],
    mutationFn: (listingId: string) => relistMarketplaceListing(listingId),
    onSuccess: async (_data, listingId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: marketplaceKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: marketplaceKeys.detail(listingId),
        }),
      ]);
    },
    gcTime: 0,
  });
}
