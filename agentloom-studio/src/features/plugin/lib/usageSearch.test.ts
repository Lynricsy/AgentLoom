import { describe, expect, it } from 'vitest'

import {
  parsePluginUsageSearch,
  resolvePluginUsageSearch,
  toPluginUsageRange,
} from './usageSearch'

describe('plugin usage search', () => {
  it('restores period and pagination from a refreshed URL', () => {
    const rawSearch = Object.fromEntries(
      new URLSearchParams('page=3&periodStart=2026-06-01&periodEnd=2026-06-30'),
    )

    expect(
      resolvePluginUsageSearch(
        parsePluginUsageSearch(rawSearch),
        new Date('2026-08-25T10:00:00.000Z'),
      ),
    ).toEqual({
      page: 3,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
    })
  })

  it('defaults to the current UTC calendar month up to today', () => {
    expect(
      resolvePluginUsageSearch({}, new Date('2026-08-25T10:00:00.000Z')),
    ).toEqual({
      page: 1,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-25',
    })
  })

  it('drops malformed dates instead of throwing', () => {
    const rawSearch = Object.fromEntries(
      new URLSearchParams('periodStart=2026/06/01&page=0'),
    )

    expect(
      resolvePluginUsageSearch(
        parsePluginUsageSearch(rawSearch),
        new Date('2026-08-25T10:00:00.000Z'),
      ),
    ).toEqual({
      page: 1,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-25',
    })
  })

  it('expands the range to a closed interval covering the whole end day', () => {
    expect(
      toPluginUsageRange({
        page: 1,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-25',
      }),
    ).toEqual({
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-25T23:59:59.999Z',
    })
  })
})
