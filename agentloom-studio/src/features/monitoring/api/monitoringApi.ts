import { apiClient } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'
import type { MonitoringDashboard, MonitoringWindow } from '../types/monitoring'

export async function fetchMonitoringDashboard(
  organizationId: string,
  window: MonitoringWindow,
): Promise<MonitoringDashboard> {
  const response = await apiClient
    .get(`organizations/${organizationId}/monitoring`, {
      searchParams: { window },
    })
    .json<ApiResponse<MonitoringDashboard>>()

  return response.data
}
