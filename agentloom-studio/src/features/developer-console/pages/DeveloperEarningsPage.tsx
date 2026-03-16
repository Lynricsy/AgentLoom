import { EarningsDashboard } from '../components/EarningsDashboard'

export function DeveloperEarningsPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold text-foreground">
          开发者收益
        </h1>
        <EarningsDashboard />
      </div>
    </div>
  )
}
