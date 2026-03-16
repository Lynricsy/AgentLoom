import { Pagination } from '@/shared/components/Pagination'
import type { PaginatedResponse } from '@/shared/types/api'
import type { SettlementRecord } from '../api/developer-earnings.api'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const numberFormatter = new Intl.NumberFormat('en-US')

const STATUS_CONFIG = {
  pending: {
    label: '待处理',
    className: 'bg-yellow-500/20 text-yellow-400',
  },
  processing: {
    label: '处理中',
    className: 'bg-blue-500/20 text-blue-400',
  },
  completed: {
    label: '已完成',
    className: 'bg-green-500/20 text-green-400',
  },
  failed: {
    label: '失败',
    className: 'bg-red-500/20 text-red-400',
  },
} as const

function formatPeriod(start: string, end: string): string {
  return `${start.slice(0, 10)} ~ ${end.slice(0, 10)}`
}

interface SettlementHistoryProps {
  settlements: PaginatedResponse<SettlementRecord> | undefined
  isLoading: boolean
  page: number
  onPageChange: (page: number) => void
}

const SKELETON_ROW_KEYS = ['skel-stl-1', 'skel-stl-2', 'skel-stl-3', 'skel-stl-4', 'skel-stl-5']
const SKELETON_COL_KEYS = ['col-1', 'col-2', 'col-3', 'col-4', 'col-5', 'col-6']

function SkeletonRows() {
  return (
    <>
      {SKELETON_ROW_KEYS.map((rowKey) => (
        <tr key={rowKey}>
          {SKELETON_COL_KEYS.map((colKey) => (
            <td key={colKey} className="px-4 py-3">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function SettlementHistory({
  settlements,
  isLoading,
  page,
  onPageChange,
}: SettlementHistoryProps) {
  const records = settlements?.data
  const totalPages = settlements?.meta.totalPages ?? 1

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold text-foreground">结算历史</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">期间</th>
              <th className="px-4 py-3 font-medium">插件名</th>
              <th className="px-4 py-3 font-medium">使用量</th>
              <th className="px-4 py-3 font-medium">总收入</th>
              <th className="px-4 py-3 font-medium">开发者份额</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows />
            ) : !records || records.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  暂无结算记录
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const statusConfig = STATUS_CONFIG[record.payoutStatus]
                return (
                  <tr
                    key={record.id}
                    className="border-b border-border/50 last:border-b-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatPeriod(record.periodStart, record.periodEnd)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {record.pluginName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {numberFormatter.format(record.totalExecutions)}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {currencyFormatter.format(
                        parseFloat(record.totalRevenue),
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {currencyFormatter.format(
                        parseFloat(record.developerShare),
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.className}`}
                      >
                        {statusConfig.label}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {settlements && totalPages > 1 && (
        <div className="border-t border-border p-3">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            isLoading={isLoading}
          />
        </div>
      )}
    </div>
  )
}
