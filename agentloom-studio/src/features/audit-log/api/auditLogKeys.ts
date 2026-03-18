import type { AuditLogListParams } from '../types/auditLog'

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  lists: () => [...auditLogKeys.all, 'list'] as const,
  list: (filters?: AuditLogListParams) =>
    [...auditLogKeys.lists(), filters ?? {}] as const,
  details: () => [...auditLogKeys.all, 'detail'] as const,
  detail: (id: string) => [...auditLogKeys.details(), id] as const,
  resourceSequences: () => [...auditLogKeys.all, 'resource-sequence'] as const,
  resourceSequence: (resourceType: string, resourceId: string) =>
    [...auditLogKeys.resourceSequences(), resourceType, resourceId] as const,
}
