import type { PaginationMeta } from '@/shared/types/api'

export const INTERVENTION_ROLES = [
  'owner',
  'admin',
  'creator',
  'operator',
  'viewer',
] as const

export const CONFIGURABLE_INTERVENTION_ROLES = [
  'owner',
  'admin',
  'creator',
  'operator',
] as const

export const MANAGEABLE_INTERVENTION_ROLES = ['owner', 'admin', 'creator'] as const

export const TIMEOUT_ACTIONS = ['approve', 'reject', 'escalate'] as const

export const NOTIFY_CHANNELS = ['in_app', 'email', 'push'] as const

export const INTERVENTION_POLICY_SOURCES = [
  'node',
  'workflow',
  'system_default',
] as const

export type InterventionRole = (typeof INTERVENTION_ROLES)[number]
export type ConfigurableInterventionRole = (typeof CONFIGURABLE_INTERVENTION_ROLES)[number]
export type ManageableInterventionRole = (typeof MANAGEABLE_INTERVENTION_ROLES)[number]
export type TimeoutAction = (typeof TIMEOUT_ACTIONS)[number]
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number]
export type InterventionPolicySource = (typeof INTERVENTION_POLICY_SOURCES)[number]

export interface InterventionPolicy {
  id: string
  workflowId: string
  nodeId: string | null
  allowedRoles: InterventionRole[]
  timeoutSeconds: number
  timeoutAction: TimeoutAction
  escalateToRole: InterventionRole | null
  notifyChannels: NotifyChannel[]
  version: number
  createdAt?: string
  updatedAt?: string
}

export interface ResolvedInterventionPolicy {
  allowedRoles: InterventionRole[]
  timeoutSeconds: number
  timeoutAction: TimeoutAction
  escalateToRole: InterventionRole | null
  notifyChannels: NotifyChannel[]
  source: InterventionPolicySource
}

export interface InterventionPolicyListResult {
  data: InterventionPolicy[]
  meta?: PaginationMeta
}

export interface InterventionPolicyMutationData {
  nodeId: string | null
  allowedRoles: InterventionRole[]
  timeoutSeconds: number
  timeoutAction: TimeoutAction
  escalateToRole: InterventionRole | null
  notifyChannels: NotifyChannel[]
}

export type CreateInterventionPolicyData = InterventionPolicyMutationData
export type UpdateInterventionPolicyData = InterventionPolicyMutationData & {
  version: number
}

export interface InterventionPolicyTokenPayload {
  tenantRole?: string
  tenant_role?: string
  role?: string
  roles?: string[]
  appMetadata?: {
    role?: string
    roles?: string[]
  }
  app_metadata?: {
    role?: string
    roles?: string[]
  }
  userMetadata?: {
    role?: string
    roles?: string[]
  }
  user_metadata?: {
    role?: string
    roles?: string[]
  }
  realm_access?: {
    roles?: string[]
  }
}

export function isInterventionRole(value: string): value is InterventionRole {
  return INTERVENTION_ROLES.includes(value as InterventionRole)
}

export function isTimeoutAction(value: string): value is TimeoutAction {
  return TIMEOUT_ACTIONS.includes(value as TimeoutAction)
}

export function isNotifyChannel(value: string): value is NotifyChannel {
  return NOTIFY_CHANNELS.includes(value as NotifyChannel)
}
