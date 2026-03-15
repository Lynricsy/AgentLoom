import { describe, expect, it } from 'vitest'

import {
  canManageInterventionPolicies,
  getInterventionPolicyRoleFromToken,
} from './policyPermissions'

function createToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${header}.${body}.signature`
}

describe('policyPermissions', () => {
  it('支持从 tenantRole claim 读取角色', () => {
    const token = createToken({ tenantRole: 'admin' })

    expect(getInterventionPolicyRoleFromToken(token)).toBe('admin')
  })

  it('支持从 tenant_role claim 读取角色', () => {
    const token = createToken({ tenant_role: 'creator' })

    expect(getInterventionPolicyRoleFromToken(token)).toBe('creator')
  })

  it('仅 owner/admin/creator 可管理介入策略', () => {
    expect(canManageInterventionPolicies('owner')).toBe(true)
    expect(canManageInterventionPolicies('admin')).toBe(true)
    expect(canManageInterventionPolicies('creator')).toBe(true)
    expect(canManageInterventionPolicies('operator')).toBe(false)
    expect(canManageInterventionPolicies('viewer')).toBe(false)
    expect(canManageInterventionPolicies(null)).toBe(false)
  })
})
