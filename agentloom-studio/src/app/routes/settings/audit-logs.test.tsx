import { describe, expect, it } from 'vitest'

import { auditLogsRoute } from './audit-logs'

describe('auditLogsRoute', () => {
  it('mounts the audit logs page on /settings/audit-logs', () => {
    expect(auditLogsRoute.options).toMatchObject({
      path: '/settings/audit-logs',
    })
  })
})
