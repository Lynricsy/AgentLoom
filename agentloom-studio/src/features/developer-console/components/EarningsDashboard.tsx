import { useState } from 'react'

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
      />
    </div>
  )
}
