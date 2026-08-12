/**
 * 私有部署设置的令牌权限判定。
 *
 * 这里只判定「令牌里的角色」与「令牌里的租户 id」：组织 id 不在登录令牌的 claim 里
 * （实测 Supabase JWT 只有 tenant_id / tenant_role），且 tenantId 不是 organizationId ——
 * 需要组织 id 请用 `useCurrentOrganization()`（GET organizations/current，由服务端按租户解析）。
 */

import {
  type InterventionPolicyTokenPayload,
  type InterventionRole,
  isInterventionRole,
} from '@/features/intervention-policy/types'

export interface PrivateDeploymentTokenPayload extends InterventionPolicyTokenPayload {
  tenantId?: string
  tenant_id?: string
  appMetadata?: InterventionPolicyTokenPayload['appMetadata'] & {
    tenantId?: string
    tenant_id?: string
  }
  app_metadata?: InterventionPolicyTokenPayload['app_metadata'] & {
    tenantId?: string
    tenant_id?: string
  }
  userMetadata?: InterventionPolicyTokenPayload['userMetadata'] & {
    tenantId?: string
    tenant_id?: string
  }
  user_metadata?: InterventionPolicyTokenPayload['user_metadata'] & {
    tenantId?: string
    tenant_id?: string
  }
}

export type PrivateDeploymentAccessRole = Extract<InterventionRole, 'owner' | 'admin'>

function decodeBase64Url(segment: string): string | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return globalThis.atob(padded)
  } catch {
    return null
  }
}

function parsePayload(token?: string): PrivateDeploymentTokenPayload | null {
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
    return JSON.parse(decoded) as PrivateDeploymentTokenPayload
  } catch {
    return null
  }
}

function normalizeStringCandidates(values: Array<string | undefined>): string[] {
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function collectRoleCandidates(payload: PrivateDeploymentTokenPayload | null): string[] {
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

function collectTenantIdCandidates(payload: PrivateDeploymentTokenPayload | null): string[] {
  if (!payload) {
    return []
  }

  return normalizeStringCandidates([
    payload.tenantId,
    payload.tenant_id,
    payload.appMetadata?.tenantId,
    payload.appMetadata?.tenant_id,
    payload.app_metadata?.tenantId,
    payload.app_metadata?.tenant_id,
    payload.userMetadata?.tenantId,
    payload.userMetadata?.tenant_id,
    payload.user_metadata?.tenantId,
    payload.user_metadata?.tenant_id,
  ])
}

export function getPrivateDeploymentRoleFromToken(token?: string): InterventionRole | null {
  const candidates = collectRoleCandidates(parsePayload(token))

  if (candidates.some((candidate) => candidate.trim().toLowerCase() === 'owner')) {
    return 'owner'
  }

  if (candidates.some((candidate) => candidate.trim().toLowerCase() === 'admin')) {
    return 'admin'
  }

  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase()

    if (isInterventionRole(normalized)) {
      return normalized
    }
  }

  return null
}

export function canManagePrivateDeployment(
  role: InterventionRole | null,
): role is PrivateDeploymentAccessRole {
  return role === 'owner' || role === 'admin'
}

/** 只读令牌里的租户 claim。tenantId 不是 organizationId，因此不做任何组织 id 回退 */
export function getPrivateDeploymentTenantIdFromToken(token?: string): string | null {
  return collectTenantIdCandidates(parsePayload(token))[0] ?? null
}
