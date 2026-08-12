/**
 * 审计日志的令牌权限判定。
 *
 * 角色 claim 的来源、可靠性与「为什么前端读 claim 是安全的」，
 * 见 `@/features/intervention-policy/lib/policyPermissions` 的文件头说明。
 * 需要组织 id 请用 `useCurrentOrganization()`，不要拿 tenantId 兜底。
 */

import {
  type InterventionPolicyTokenPayload,
  type InterventionRole,
  isInterventionRole,
} from '@/features/intervention-policy/types'

export type AuditLogAccessRole = Extract<InterventionRole, 'owner' | 'admin'>

function decodeBase64Url(segment: string): string | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return globalThis.atob(padded)
  } catch {
    return null
  }
}

function parsePayload(token?: string): InterventionPolicyTokenPayload | null {
  if (!token) {
    return null
  }

  const segments = token.split('.')

  if (segments.length < 2 || !segments[1]) {
    return null
  }

  const decoded = decodeBase64Url(segments[1])

  if (!decoded) {
    return null
  }

  try {
    return JSON.parse(decoded) as InterventionPolicyTokenPayload
  } catch {
    return null
  }
}

function collectRoleCandidates(
  payload: InterventionPolicyTokenPayload | null,
): string[] {
  if (!payload) {
    return []
  }

  const candidates = [
    payload.tenantRole,
    payload.tenant_role,
    payload.role,
    ...(payload.roles ?? []),
    payload.appMetadata?.role,
    ...(payload.appMetadata?.roles ?? []),
    payload.app_metadata?.role,
    ...(payload.app_metadata?.roles ?? []),
    payload.userMetadata?.role,
    ...(payload.userMetadata?.roles ?? []),
    payload.user_metadata?.role,
    ...(payload.user_metadata?.roles ?? []),
    ...(payload.realm_access?.roles ?? []),
  ]

  return candidates.filter((value): value is string => typeof value === 'string')
}

export function getAuditLogRoleFromToken(token?: string): InterventionRole | null {
  const candidates = collectRoleCandidates(parsePayload(token))

  for (const allowedRole of ['owner', 'admin'] as const) {
    if (candidates.some((candidate) => candidate.trim().toLowerCase() === allowedRole)) {
      return allowedRole
    }
  }

  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase()
    if (isInterventionRole(normalized)) {
      return normalized
    }
  }

  return null
}

export function canAccessAuditLogs(
  role: InterventionRole | null,
): role is AuditLogAccessRole {
  return role === 'owner' || role === 'admin'
}
