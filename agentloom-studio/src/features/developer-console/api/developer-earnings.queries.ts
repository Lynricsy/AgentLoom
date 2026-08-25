import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchEarningsSummary,
  fetchMonthlyTrends,
  fetchPluginUsageRanking,
  fetchSettlementHistory,
  updatePayoutStatus,
} from './developer-earnings.api'
import type {
  EarningsFilters,
  UpdatePayoutStatusRequest,
} from './developer-earnings.api'

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

export function useUpdatePayoutStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      earningId,
      body,
    }: {
      earningId: string
      body: UpdatePayoutStatusRequest
    }) => updatePayoutStatus(earningId, body),
    // 打款状态改变会同时挪动 summary 里的待打款/已打款分项
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: developerEarningsKeys.all,
      })
    },
  })
}
