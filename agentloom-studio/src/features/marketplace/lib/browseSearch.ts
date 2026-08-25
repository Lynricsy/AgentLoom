import { z } from 'zod'

import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
  type MarketplacePricingModel,
  type MarketplaceSortOption,
} from '../types'
import type { MarketplaceListingTypeFilter } from './display'

/** 「全部」哨兵：Radix Tabs/Select 不接受空串 value，同时也不写入 URL */
export type BrowseCategoryFilter = MarketplaceCategory | 'all'
export type BrowsePricingFilter = MarketplacePricingModel | 'all'

const CATEGORY_VALUES = MARKETPLACE_CATEGORIES.map(
  (category) => category.value,
) as [MarketplaceCategory, ...MarketplaceCategory[]]

/**
 * 公开市场浏览页的 URL search 契约。
 * 全部字段可选：缺省即「全部/首页/最受欢迎」，刷新与分享链接都能还原视图。
 */
export const marketplaceBrowseSearchSchema = z.object({
  page: z.coerce.number().int().positive().optional().catch(undefined),
  category: z.enum(CATEGORY_VALUES).optional().catch(undefined),
  listingType: z.enum(['workflow', 'plugin']).optional().catch(undefined),
  pricingModel: z.enum(['free', 'per_execution']).optional().catch(undefined),
  sort: z.enum(['popular', 'rating', 'newest']).optional().catch(undefined),
  search: z.string().optional().catch(undefined),
})

export type MarketplaceBrowseSearchParams = z.infer<
  typeof marketplaceBrowseSearchSchema
>

export interface MarketplaceBrowseSearch {
  page: number
  category: BrowseCategoryFilter
  listingType: MarketplaceListingTypeFilter
  pricingModel: BrowsePricingFilter
  sort: MarketplaceSortOption
  search: string
}

export function parseMarketplaceBrowseSearch(
  input: unknown,
): MarketplaceBrowseSearchParams {
  return marketplaceBrowseSearchSchema.parse(input)
}

export function resolveMarketplaceBrowseSearch(
  input: MarketplaceBrowseSearchParams,
): MarketplaceBrowseSearch {
  return {
    page: input.page ?? 1,
    category: input.category ?? 'all',
    listingType: input.listingType ?? 'all',
    pricingModel: input.pricingModel ?? 'all',
    sort: input.sort ?? 'popular',
    search: input.search ?? '',
  }
}

/**
 * 解析态回写 URL：默认值与「全部」哨兵折叠成 undefined，
 * TanStack Router 会把它们从 query string 里剔除，保持链接干净可分享。
 */
export function marketplaceBrowseSearchToParams(
  search: MarketplaceBrowseSearch,
): MarketplaceBrowseSearchParams {
  return {
    page: search.page === 1 ? undefined : search.page,
    category: search.category === 'all' ? undefined : search.category,
    listingType: search.listingType === 'all' ? undefined : search.listingType,
    pricingModel:
      search.pricingModel === 'all' ? undefined : search.pricingModel,
    sort: search.sort === 'popular' ? undefined : search.sort,
    search: search.search || undefined,
  }
}
