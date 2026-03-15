import type { MyListingsFilters, PublicListingsFilters } from '../types';

export const marketplaceKeys = {
  all: ['marketplace'] as const,
  lists: () => [...marketplaceKeys.all, 'list'] as const,
  list: (filters?: MyListingsFilters) =>
    [...marketplaceKeys.lists(), filters] as const,
  details: () => [...marketplaceKeys.all, 'detail'] as const,
  detail: (id: string) => [...marketplaceKeys.details(), id] as const,
};

export const publicMarketplaceKeys = {
  all: ['public-marketplace'] as const,
  lists: () => [...publicMarketplaceKeys.all, 'list'] as const,
  list: (filters: PublicListingsFilters) =>
    [...publicMarketplaceKeys.lists(), filters] as const,
  details: () => [...publicMarketplaceKeys.all, 'detail'] as const,
  detail: (id: string) => [...publicMarketplaceKeys.details(), id] as const,
  reviews: (id: string) => [...publicMarketplaceKeys.all, 'reviews', id] as const,
};
