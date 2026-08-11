import { DeveloperConsoleLayout } from '../components/DeveloperConsoleLayout'
import { EarningsDashboard } from '../components/EarningsDashboard'

export function DeveloperEarningsPage() {
  return (
    <DeveloperConsoleLayout activeTab="earnings">
      <EarningsDashboard />
    </DeveloperConsoleLayout>
  )
}
