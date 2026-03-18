export const AUDIT_ACTOR_TYPES = ['user', 'system', 'service'] as const

export const AUDIT_PAGE_SIZE_OPTIONS = [20, 50, 100] as const

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number]

export interface AuditLogListParams {
  from?: string
  to?: string
  eventType?: string
  resourceType?: string
  resourceId?: string
  executionId?: string
  actorType?: AuditActorType
  actorId?: string
  page?: number
  pageSize?: number
}

export interface AuditLogRecord {
  id: string
  tenantId?: string
  actorId: string | null
  actorType: AuditActorType
  eventType: string
  resourceType: string
  resourceId: string
  executionId: string | null
  summary: string | null
  before: unknown | null
  after: unknown | null
  metadata: unknown | null
  createdAt: string
}

export type AuditLogDetail = AuditLogRecord
export type AuditLogSequenceRecord = AuditLogRecord
