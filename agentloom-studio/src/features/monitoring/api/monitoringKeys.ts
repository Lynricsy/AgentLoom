import type { MonitoringWindow } from '../types/monitoring'

export const monitoringKeys = {
  all: ['monitoring'] as const,
  dashboards: () => [...monitoringKeys.all, 'dashboard'] as const,
  dashboard: (organizationId: string, window: MonitoringWindow) =>
    [...monitoringKeys.dashboards(), organizationId, window] as const,
}
