import { createRoute } from '@tanstack/react-router'
import { AuditLogPage } from '@/features/audit-log'
import { settingsLayoutRoute } from './layout'

export const auditLogsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: '/settings/audit-logs',
  component: AuditLogPage,
})
