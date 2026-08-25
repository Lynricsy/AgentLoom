import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  relistPluginMarketplaceListing,
  relistMarketplaceListing,
  submitMarketplaceListing,
  submitPluginMarketplaceListing,
  unlistPluginMarketplaceListing,
  unlistMarketplaceListing,
  updatePluginMarketplaceListing,
} from './marketplaceApi';
import { marketplaceKeys } from './marketplaceKeys';
import type {
  SubmitMarketplaceListingRequest,
  SubmitPluginListingRequest,
  UpdatePluginListingRequest,
} from '../types';

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

export function useUnlistPluginMarketplaceListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...marketplaceKeys.all, 'plugin-unlist'],
    mutationFn: (listingId: string) => unlistPluginMarketplaceListing(listingId),
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

export function useRelistPluginMarketplaceListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...marketplaceKeys.all, 'plugin-relist'],
    mutationFn: (listingId: string) => relistPluginMarketplaceListing(listingId),
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

export function useSubmitPluginMarketplaceListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...marketplaceKeys.all, 'plugin-submit'],
    mutationFn: (request: SubmitPluginListingRequest) =>
      submitPluginMarketplaceListing(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: marketplaceKeys.lists() });
    },
    gcTime: 0,
  });
}

export function useUpdatePluginMarketplaceListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...marketplaceKeys.all, 'plugin-update'],
    mutationFn: ({
      listingId,
      request,
    }: {
      listingId: string;
      request: UpdatePluginListingRequest;
    }) => updatePluginMarketplaceListing(listingId, request),
    onSuccess: async (_data, { listingId }) => {
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
