import { createRoute } from '@tanstack/react-router'
import { AuditLogPage } from '@/features/audit-log'
import { rootRoute } from '../__root'

export const auditLogsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/audit-logs',
  component: AuditLogPage,
})
