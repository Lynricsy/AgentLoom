import { useQuery } from '@tanstack/react-query'

import {
  fetchEarningsSummary,
  fetchMonthlyTrends,
  fetchPluginUsageRanking,
  fetchSettlementHistory,
} from './developer-earnings.api'
import type { EarningsFilters } from './developer-earnings.api'

export const developerEarningsKeys = {
  all: ['developer-earnings'] as const,
  summary: () => [...developerEarningsKeys.all, 'summary'] as const,
  trends: () => [...developerEarningsKeys.all, 'trends'] as const,
  ranking: () => [...developerEarningsKeys.all, 'ranking'] as const,
  settlements: () => [...developerEarningsKeys.all, 'settlements'] as const,
  settlementList: (filters: EarningsFilters) =>
    [...developerEarningsKeys.settlements(), filters] as const,
}

export function useEarningsSummary() {
  return useQuery({
    queryKey: developerEarningsKeys.summary(),
    queryFn: fetchEarningsSummary,
    staleTime: 2 * 60 * 1000,
  })
}

export function useMonthlyTrends() {
  return useQuery({
    queryKey: developerEarningsKeys.trends(),
    queryFn: fetchMonthlyTrends,
    staleTime: 5 * 60 * 1000,
  })
}

export function usePluginUsageRanking() {
  return useQuery({
    queryKey: developerEarningsKeys.ranking(),
    queryFn: fetchPluginUsageRanking,
    staleTime: 2 * 60 * 1000,
  })
}

export function useSettlementHistory(filters: EarningsFilters) {
  return useQuery({
    queryKey: developerEarningsKeys.settlementList(filters),
    queryFn: () => fetchSettlementHistory(filters),
    staleTime: 2 * 60 * 1000,
  })
}
