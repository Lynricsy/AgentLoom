import type { PluginUsageRank } from '../api/developer-earnings.api'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const numberFormatter = new Intl.NumberFormat('en-US')

interface PluginUsageRankingProps {
  rankings: PluginUsageRank[] | undefined
  isLoading: boolean
}

const SKELETON_KEYS = ['skel-rank-1', 'skel-rank-2', 'skel-rank-3', 'skel-rank-4']

function SkeletonRows() {
  return (
    <>
      {SKELETON_KEYS.map((key) => (
        <tr key={key}>
          <td className="px-4 py-3">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
          </td>
        </tr>
      ))}
    </>
  )
}

export function PluginUsageRanking({
  rankings,
  isLoading,
}: PluginUsageRankingProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold text-foreground">
          插件使用排名
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">插件名称</th>
              <th className="px-4 py-3 font-medium">使用次数</th>
              <th className="px-4 py-3 font-medium">收入</th>
              <th className="px-4 py-3 font-medium">占比</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows />
            ) : !rankings || rankings.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  暂无使用数据
                </td>
              </tr>
            ) : (
              rankings.map((rank) => (
                <tr
                  key={rank.pluginId}
                  className="border-b border-border/50 last:border-b-0"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {rank.pluginName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {numberFormatter.format(rank.executionCount)}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {currencyFormatter.format(parseFloat(rank.revenue))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {rank.percentage.toFixed(1)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
