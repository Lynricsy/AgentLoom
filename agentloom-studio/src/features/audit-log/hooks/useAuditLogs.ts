import { useQuery } from '@tanstack/react-query'

import {
  fetchAuditLogDetail,
  fetchAuditLogResourceSequence,
  fetchAuditLogs,
} from '../api/auditLogApi'
import { auditLogKeys } from '../api/auditLogKeys'
import type { AuditLogListParams } from '../types/auditLog'

export function useAuditLogs(params?: AuditLogListParams) {
  return useQuery({
    queryKey: auditLogKeys.list(params ? { ...params } : undefined),
    queryFn: () => fetchAuditLogs(params),
  })
}

export function useAuditLogDetail(
  id: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: auditLogKeys.detail(id ?? 'unknown'),
    queryFn: () => fetchAuditLogDetail(id!),
    enabled: Boolean(id) && (options?.enabled ?? true),
  })
}

export function useAuditLogResourceSequence(
  resourceType: string | null,
  resourceId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: auditLogKeys.resourceSequence(
      resourceType ?? 'unknown',
      resourceId ?? 'unknown',
    ),
    queryFn: () => fetchAuditLogResourceSequence(resourceType!, resourceId!),
    enabled: Boolean(resourceType && resourceId) && (options?.enabled ?? true),
  })
}
