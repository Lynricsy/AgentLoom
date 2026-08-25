import { describe, expect, it } from 'vitest'

import { marketplaceKeys, publicMarketplaceKeys } from './marketplaceKeys'

describe('marketplaceKeys', () => {
  it('creates stable list keys', () => {
    expect(marketplaceKeys.all).toEqual(['marketplace'])
    expect(marketplaceKeys.lists()).toEqual(['marketplace', 'list'])
    expect(marketplaceKeys.list()).toEqual(['marketplace', 'list', undefined])
    expect(
      marketplaceKeys.list({ page: 2, pageSize: 10, status: 'listed' }),
    ).toEqual([
      'marketplace',
      'list',
      { page: 2, pageSize: 10, status: 'listed' },
    ])
  })

  it('creates stable detail keys', () => {
    expect(marketplaceKeys.details()).toEqual(['marketplace', 'detail'])
    expect(marketplaceKeys.detail('listing-1')).toEqual([
      'marketplace',
      'detail',
      'listing-1',
    ])
  })

  it('creates public marketplace list and detail keys', () => {
    expect(publicMarketplaceKeys.all).toEqual(['public-marketplace'])
    expect(publicMarketplaceKeys.lists()).toEqual(['public-marketplace', 'list'])
    expect(
      publicMarketplaceKeys.list({
        category: 'analysis',
        sort: 'popular',
        page: 1,
        pageSize: 12,
      }),
    ).toEqual([
      'public-marketplace',
      'list',
      {
        category: 'analysis',
        sort: 'popular',
        page: 1,
        pageSize: 12,
      },
    ])
    expect(publicMarketplaceKeys.detail('listing-1')).toEqual([
      'public-marketplace',
      'detail',
      'listing-1',
    ])
    expect(publicMarketplaceKeys.reviews('listing-1')).toEqual([
      'public-marketplace',
      'reviews',
      'listing-1',
    ])
  })

  it('folds pricingModel into the public list key', () => {
    expect(
      publicMarketplaceKeys.list({
        pricingModel: 'per_execution',
        sort: 'popular',
        page: 1,
        pageSize: 12,
      }),
    ).toEqual([
      'public-marketplace',
      'list',
      {
        pricingModel: 'per_execution',
        sort: 'popular',
        page: 1,
        pageSize: 12,
      },
    ])
    expect(
      publicMarketplaceKeys.list({ pricingModel: 'free', page: 1 }),
    ).not.toEqual(publicMarketplaceKeys.list({ page: 1 }))
  })
})
