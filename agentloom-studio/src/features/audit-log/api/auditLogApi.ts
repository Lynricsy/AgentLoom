import { apiClient } from '@/shared/api/client'
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api'

import type {
  AuditLogDetail,
  AuditLogListParams,
  AuditLogRecord,
  AuditLogSequenceRecord,
} from '../types/auditLog'

const BASE_PATH = 'audit-logs'

function appendSearchParam(
  searchParams: Record<string, string>,
  key: keyof AuditLogListParams,
  value: string | number | undefined,
) {
  if (value == null) {
    return
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return
  }

  searchParams[key] = String(value)
}

export function buildAuditLogSearchParams(
  params?: AuditLogListParams,
): Record<string, string> {
  const searchParams: Record<string, string> = {}

  appendSearchParam(searchParams, 'from', params?.from)
  appendSearchParam(searchParams, 'to', params?.to)
  appendSearchParam(searchParams, 'eventType', params?.eventType)
  appendSearchParam(searchParams, 'resourceType', params?.resourceType)
  appendSearchParam(searchParams, 'resourceId', params?.resourceId)
  appendSearchParam(searchParams, 'executionId', params?.executionId)
  appendSearchParam(searchParams, 'actorType', params?.actorType)
  appendSearchParam(searchParams, 'actorId', params?.actorId)
  appendSearchParam(searchParams, 'page', params?.page)
  appendSearchParam(searchParams, 'pageSize', params?.pageSize)

  return searchParams
}

export async function fetchAuditLogs(
  params?: AuditLogListParams,
): Promise<PaginatedResponse<AuditLogRecord>> {
  return apiClient
    .get(BASE_PATH, { searchParams: buildAuditLogSearchParams(params) })
    .json<PaginatedResponse<AuditLogRecord>>()
}

export async function fetchAuditLogDetail(id: string): Promise<AuditLogDetail> {
  const response = await apiClient
    .get(`${BASE_PATH}/${id}`)
    .json<ApiResponse<AuditLogDetail>>()

  return response.data
}

export async function fetchAuditLogResourceSequence(
  resourceType: string,
  resourceId: string,
): Promise<AuditLogSequenceRecord[]> {
  const response = await apiClient
    .get(
      `${BASE_PATH}/resources/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/sequence`,
    )
    .json<ApiResponse<AuditLogSequenceRecord[]>>()

  return response.data
}
