import { describe, expect, it } from 'vitest'

import {
  marketplaceBrowseSearchToParams,
  parseMarketplaceBrowseSearch,
  resolveMarketplaceBrowseSearch,
} from './browseSearch'

describe('marketplace browse search', () => {
  it('restores filters and pagination from a refreshed URL', () => {
    const rawSearch = Object.fromEntries(
      new URLSearchParams(
        'page=3&category=analysis&listingType=plugin&pricingModel=per_execution&sort=newest&search=uppercase',
      ),
    )

    expect(
      resolveMarketplaceBrowseSearch(parseMarketplaceBrowseSearch(rawSearch)),
    ).toEqual({
      page: 3,
      category: 'analysis',
      listingType: 'plugin',
      pricingModel: 'per_execution',
      sort: 'newest',
      search: 'uppercase',
    })
  })

  it('falls back to 全部/首页 defaults for absent or invalid params', () => {
    const rawSearch = Object.fromEntries(
      new URLSearchParams('page=0&pricingModel=subscription&sort=cheapest'),
    )

    expect(
      resolveMarketplaceBrowseSearch(parseMarketplaceBrowseSearch(rawSearch)),
    ).toEqual({
      page: 1,
      category: 'all',
      listingType: 'all',
      pricingModel: 'all',
      sort: 'popular',
      search: '',
    })
  })

  it('drops defaults and 全部 sentinels when writing back to the URL', () => {
    expect(
      marketplaceBrowseSearchToParams({
        page: 1,
        category: 'all',
        listingType: 'all',
        pricingModel: 'all',
        sort: 'popular',
        search: '',
      }),
    ).toEqual({
      page: undefined,
      category: undefined,
      listingType: undefined,
      pricingModel: undefined,
      sort: undefined,
      search: undefined,
    })
  })

  it('keeps every non-default filter in the URL', () => {
    expect(
      marketplaceBrowseSearchToParams({
        page: 2,
        category: 'content',
        listingType: 'plugin',
        pricingModel: 'free',
        sort: 'rating',
        search: 'ocr',
      }),
    ).toEqual({
      page: 2,
      category: 'content',
      listingType: 'plugin',
      pricingModel: 'free',
      sort: 'rating',
      search: 'ocr',
    })
  })
})
