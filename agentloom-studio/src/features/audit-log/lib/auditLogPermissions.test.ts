import { describe, expect, it } from 'vitest'

import {
  canAccessAuditLogs,
  getAuditLogRoleFromToken,
} from './auditLogPermissions'

function createToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${header}.${body}.signature`
}

describe('auditLogPermissions', () => {
  it('prefers owner/admin when multiple role candidates are present', () => {
    const token = createToken({ app_metadata: { roles: ['viewer', 'admin'] } })

    expect(getAuditLogRoleFromToken(token)).toBe('admin')
  })

  it('falls back to the first recognized role when no audit-log role is present', () => {
    const token = createToken({ app_metadata: { roles: ['viewer', 'operator'] } })

    expect(getAuditLogRoleFromToken(token)).toBe('viewer')
  })

  it('allows only owner and admin to access audit logs', () => {
    expect(canAccessAuditLogs('owner')).toBe(true)
    expect(canAccessAuditLogs('admin')).toBe(true)
    expect(canAccessAuditLogs('creator')).toBe(false)
    expect(canAccessAuditLogs('operator')).toBe(false)
    expect(canAccessAuditLogs('viewer')).toBe(false)
    expect(canAccessAuditLogs(null)).toBe(false)
  })
})
