import { useQuery } from '@tanstack/react-query'
import { fetchMonitoringDashboard } from '../api/monitoringApi'
import { monitoringKeys } from '../api/monitoringKeys'
import type { MonitoringWindow } from '../types/monitoring'

function requireOrganizationId(organizationId?: string): string {
  if (!organizationId) {
    throw new Error('缺少组织 ID，无法请求监控仪表板。')
  }

  return organizationId
}

export function useMonitoringDashboard(
  organizationId: string | undefined,
  window: MonitoringWindow,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: monitoringKeys.dashboard(organizationId ?? '__missing__', window),
    queryFn: () => fetchMonitoringDashboard(requireOrganizationId(organizationId), window),
    enabled: Boolean(organizationId) && (options?.enabled ?? true),
  })
}
