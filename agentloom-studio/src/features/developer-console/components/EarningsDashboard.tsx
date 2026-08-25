import { useState } from 'react'

import { useAuthToken } from '@/features/auth'
import { getInterventionPolicyRoleFromToken } from '@/features/intervention-policy'

import {
  useEarningsSummary,
  useMonthlyTrends,
  usePluginUsageRanking,
  useSettlementHistory,
} from '../api/developer-earnings.queries'
import { EarningsSummaryCards } from './EarningsSummaryCards'
import { MonthlyTrendChart } from './MonthlyTrendChart'
import { PluginUsageRanking } from './PluginUsageRanking'
import { SettlementHistory } from './SettlementHistory'

export function EarningsDashboard() {
  const [settlementPage, setSettlementPage] = useState(1)
  const role = getInterventionPolicyRoleFromToken(useAuthToken())
  // PATCH /plugins/marketplace/earnings/:id/payout-status 是 @Roles('owner','admin')
  const canManagePayouts = role === 'owner' || role === 'admin'

  const summaryQuery = useEarningsSummary()
  const trendsQuery = useMonthlyTrends()
  const rankingQuery = usePluginUsageRanking()
  const settlementsQuery = useSettlementHistory({
    page: settlementPage,
    pageSize: 10,
  })

  return (
    <div className="space-y-6">
      <EarningsSummaryCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthlyTrendChart
          trends={trendsQuery.data}
          isLoading={trendsQuery.isLoading}
        />
        <PluginUsageRanking
          rankings={rankingQuery.data}
          isLoading={rankingQuery.isLoading}
        />
      </div>

      <SettlementHistory
        settlements={settlementsQuery.data}
        isLoading={settlementsQuery.isLoading}
        page={settlementPage}
        onPageChange={setSettlementPage}
        canManagePayouts={canManagePayouts}
      />
    </div>
  )
}
