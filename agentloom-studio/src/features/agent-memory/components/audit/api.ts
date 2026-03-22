/**
 * 记忆审计仪表板 — API hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, toSnakeBody } from '@/shared/api/client';
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api';
import type {
  AuditLogEntry,
  AuditLogFilters,
  MemoryVersion,
  PendingReview,
  ReviewRequestBody,
  RollbackParams,
} from './types';

// --- Query Key Factory ---

export const memoryAuditKeys = {
  all: ['memory-audit'] as const,
  auditLog: (instanceId: string) =>
    [...memoryAuditKeys.all, 'audit-log', instanceId] as const,
  auditLogFiltered: (instanceId: string, filters: Partial<AuditLogFilters>) =>
    [...memoryAuditKeys.auditLog(instanceId), filters] as const,
  pendingReviews: (instanceId: string) =>
    [...memoryAuditKeys.all, 'pending-reviews', instanceId] as const,
  nodeVersions: (instanceId: string, nodeId: string) =>
    [...memoryAuditKeys.all, 'node-versions', instanceId, nodeId] as const,
};

// --- API Functions ---

async function fetchAuditLog(
  instanceId: string,
  filters: Partial<AuditLogFilters>,
): Promise<PaginatedResponse<AuditLogEntry>> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('page_size', String(filters.pageSize));
  if (filters.operationType)
    params.set('operation_type', filters.operationType);
  if (filters.startDate) params.set('start_date', filters.startDate);
  if (filters.endDate) params.set('end_date', filters.endDate);
  if (filters.nodeName) params.set('node_name', filters.nodeName);

  const query = params.toString();
  const url = `api/v1/memory-instances/${instanceId}/audit-log${query ? `?${query}` : ''}`;
  return apiClient.get(url).json<PaginatedResponse<AuditLogEntry>>();
}

async function fetchPendingReviews(
  instanceId: string,
): Promise<PendingReview[]> {
  const res = await apiClient
    .get(`api/v1/memory-instances/${instanceId}/pending-reviews`)
    .json<ApiResponse<PendingReview[]>>();
  return res.data;
}

async function fetchNodeVersions(
  instanceId: string,
  nodeId: string,
): Promise<MemoryVersion[]> {
  const res = await apiClient
    .get(
      `api/v1/memory-instances/${instanceId}/nodes/${nodeId}/versions`,
    )
    .json<ApiResponse<MemoryVersion[]>>();
  return res.data;
}

async function submitReview(
  instanceId: string,
  body: ReviewRequestBody,
): Promise<void> {
  await apiClient
    .post(`api/v1/memory-instances/${instanceId}/review`, {
      json: toSnakeBody(body),
    })
    .json();
}

async function rollbackVersion(params: RollbackParams): Promise<void> {
  await apiClient
    .post(
      `api/v1/memory-instances/${params.instanceId}/nodes/${params.nodeId}/versions/${params.versionId}/rollback`,
    )
    .json();
}

// --- Query Hooks ---

export function useAuditLog(
  instanceId: string,
  filters: Partial<AuditLogFilters> = {},
) {
  return useQuery({
    queryKey: memoryAuditKeys.auditLogFiltered(instanceId, filters),
    queryFn: () => fetchAuditLog(instanceId, filters),
    enabled: !!instanceId,
    staleTime: 30_000,
  });
}

export function usePendingReviews(instanceId: string) {
  return useQuery({
    queryKey: memoryAuditKeys.pendingReviews(instanceId),
    queryFn: () => fetchPendingReviews(instanceId),
    enabled: !!instanceId,
    staleTime: 30_000,
  });
}

export function useNodeVersions(instanceId: string, nodeId: string) {
  return useQuery({
    queryKey: memoryAuditKeys.nodeVersions(instanceId, nodeId),
    queryFn: () => fetchNodeVersions(instanceId, nodeId),
    enabled: !!instanceId && !!nodeId,
    staleTime: 30_000,
  });
}

// --- Mutation Hooks ---

export function useReview(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewRequestBody) => submitReview(instanceId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: memoryAuditKeys.auditLog(instanceId),
      });
      void queryClient.invalidateQueries({
        queryKey: memoryAuditKeys.pendingReviews(instanceId),
      });
    },
  });
}

export function useRollback(instanceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: RollbackParams) => rollbackVersion(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: memoryAuditKeys.auditLog(instanceId),
      });
      void queryClient.invalidateQueries({
        queryKey: memoryAuditKeys.pendingReviews(instanceId),
      });
    },
  });
}
