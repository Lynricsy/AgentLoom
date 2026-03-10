import { apiClient } from '@/shared/api/client';
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api';

import type {
  EvidenceChainResponse,
  EvidenceQueryParams,
  EvidenceRecord,
  EvidenceVerifyResult,
} from '../types';

export function fetchEvidenceByExecution(
  executionId: string,
  params?: EvidenceQueryParams,
): Promise<PaginatedResponse<EvidenceRecord>> {
  const searchParams: Record<string, string> = {};

  if (params?.page != null) searchParams.page = String(params.page);
  if (params?.limit != null) searchParams.limit = String(params.limit);
  if (params?.stepId) searchParams.stepId = params.stepId;

  return apiClient
    .get(`executions/${executionId}/evidence`, { searchParams })
    .json<PaginatedResponse<EvidenceRecord>>();
}

export function fetchEvidenceById(
  executionId: string,
  evidenceId: string,
): Promise<ApiResponse<EvidenceRecord>> {
  return apiClient
    .get(`executions/${executionId}/evidence/${evidenceId}`)
    .json<ApiResponse<EvidenceRecord>>();
}

export function verifyEvidenceHash(
  executionId: string,
  evidenceId: string,
): Promise<ApiResponse<EvidenceVerifyResult>> {
  return apiClient
    .get(`executions/${executionId}/evidence/${evidenceId}/verify`)
    .json<ApiResponse<EvidenceVerifyResult>>();
}

export function fetchEvidenceChain(
  executionId: string,
  nodeId?: string,
): Promise<ApiResponse<EvidenceChainResponse>> {
  const searchParams: Record<string, string> = {};
  if (nodeId) searchParams.nodeId = nodeId;

  return apiClient
    .get(`executions/${executionId}/evidence/chain`, { searchParams })
    .json<ApiResponse<EvidenceChainResponse>>();
}
