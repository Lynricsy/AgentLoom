/**
 * 介入策略的令牌权限判定，也是全站「从令牌读角色」这一做法的 canonical 说明。
 *
 * 角色来源：`tenant_role` claim 由本仓库自带的 Supabase 认证钩子
 * `public.custom_access_token_hook` 注入（定义见
 * `agentloom-server/src/database/migrations/0004_organization_management.sql`，
 * 由 `agentloom-deploy/docker-compose.supabase.yml` 的
 * `GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_*` 启用），值取自 `organization_members.role`。
 * 钩子内部异常时写 null，此处判定为 null，UI 按无权限渲染（fail-closed）。
 *
 * 为什么前端读 claim 是安全的：真正的权限闸门在服务端 `RolesGuard`，
 * 它用 `RbacCacheService.getUserRole(tenantId, userId)` 从数据库查真实角色，
 * 不信任这个 claim。前端判定只用于 UI 门控；角色变更后 claim 要等令牌刷新才更新，
 * 期间最坏情况是多显示一个按钮，点下去仍会被服务端拒绝。
 *
 * 组织 id 则不在任何 claim 里，且 tenantId 不是 organizationId ——
 * 需要组织 id 请用 `useCurrentOrganization()`（GET organizations/current，由服务端按租户解析）。
 */

import {
  type InterventionPolicyTokenPayload,
  type InterventionRole,
  isInterventionRole,
} from '../types'

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

function collectRoleCandidates(payload: InterventionPolicyTokenPayload | null): string[] {
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

export function getInterventionPolicyRoleFromToken(
  token?: string,
): InterventionRole | null {
  const candidates = collectRoleCandidates(parsePayload(token))

  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase()
    if (isInterventionRole(normalized)) {
      return normalized
    }
  }

  return null
}

export function canManageInterventionPolicies(
  role: InterventionRole | null,
): boolean {
  if (!role) {
    return false
  }

  return role === 'owner' || role === 'admin' || role === 'creator'
}
