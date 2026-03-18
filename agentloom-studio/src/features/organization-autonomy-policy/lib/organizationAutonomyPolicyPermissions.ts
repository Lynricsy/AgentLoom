import {
  type InterventionPolicyTokenPayload,
  type InterventionRole,
  isInterventionRole,
} from '@/features/intervention-policy/types'

export interface OrganizationAutonomyPolicyTokenPayload extends InterventionPolicyTokenPayload {
  organizationId?: string
  organization_id?: string
  orgId?: string
  org_id?: string
  tenantId?: string
  tenant_id?: string
  appMetadata?: InterventionPolicyTokenPayload['appMetadata'] & {
    organizationId?: string
    organization_id?: string
    orgId?: string
    org_id?: string
    tenantId?: string
    tenant_id?: string
  }
  app_metadata?: InterventionPolicyTokenPayload['app_metadata'] & {
    organizationId?: string
    organization_id?: string
    orgId?: string
    org_id?: string
    tenantId?: string
    tenant_id?: string
  }
  userMetadata?: InterventionPolicyTokenPayload['userMetadata'] & {
    organizationId?: string
    organization_id?: string
    orgId?: string
    org_id?: string
    tenantId?: string
    tenant_id?: string
  }
  user_metadata?: InterventionPolicyTokenPayload['user_metadata'] & {
    organizationId?: string
    organization_id?: string
    orgId?: string
    org_id?: string
    tenantId?: string
    tenant_id?: string
  }
}

export type OrganizationAutonomyPolicyAccessRole = Extract<InterventionRole, 'owner'>

function decodeBase64Url(segment: string): string | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return globalThis.atob(padded)
  } catch {
    return null
  }
}

function parsePayload(token?: string): OrganizationAutonomyPolicyTokenPayload | null {
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
    return JSON.parse(decoded) as OrganizationAutonomyPolicyTokenPayload
  } catch {
    return null
  }
}

function collectRoleCandidates(payload: OrganizationAutonomyPolicyTokenPayload | null): string[] {
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

function collectOrganizationIdCandidates(
  payload: OrganizationAutonomyPolicyTokenPayload | null,
): string[] {
  if (!payload) {
    return []
  }

  const candidates = [
    payload.organizationId,
    payload.organization_id,
    payload.orgId,
    payload.org_id,
    payload.tenantId,
    payload.tenant_id,
    payload.appMetadata?.organizationId,
    payload.appMetadata?.organization_id,
    payload.appMetadata?.orgId,
    payload.appMetadata?.org_id,
    payload.appMetadata?.tenantId,
    payload.appMetadata?.tenant_id,
    payload.app_metadata?.organizationId,
    payload.app_metadata?.organization_id,
    payload.app_metadata?.orgId,
    payload.app_metadata?.org_id,
    payload.app_metadata?.tenantId,
    payload.app_metadata?.tenant_id,
    payload.userMetadata?.organizationId,
    payload.userMetadata?.organization_id,
    payload.userMetadata?.orgId,
    payload.userMetadata?.org_id,
    payload.userMetadata?.tenantId,
    payload.userMetadata?.tenant_id,
    payload.user_metadata?.organizationId,
    payload.user_metadata?.organization_id,
    payload.user_metadata?.orgId,
    payload.user_metadata?.org_id,
    payload.user_metadata?.tenantId,
    payload.user_metadata?.tenant_id,
  ]

  return candidates
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

export function getOrganizationAutonomyPolicyRoleFromToken(
  token?: string,
): InterventionRole | null {
  const candidates = collectRoleCandidates(parsePayload(token))

  if (candidates.some((candidate) => candidate.trim().toLowerCase() === 'owner')) {
    return 'owner'
  }

  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase()
    if (isInterventionRole(normalized)) {
      return normalized
    }
  }

  return null
}

export function canManageOrganizationAutonomyPolicy(
  role: InterventionRole | null,
): role is OrganizationAutonomyPolicyAccessRole {
  return role === 'owner'
}

export function getOrganizationIdFromToken(token?: string): string | null {
  return collectOrganizationIdCandidates(parsePayload(token))[0] ?? null
}
