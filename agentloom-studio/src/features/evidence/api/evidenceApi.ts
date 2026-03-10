import { apiClient } from '@/shared/api/client';
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api';

import type {
  EvidenceChainResponse,
  EvidenceQueryParams,
  EvidenceRecord,
  EvidenceVerifyResult,
} from '../types';

const MAX_EVIDENCE_PAGE_SIZE = 100;

export function fetchEvidenceByExecution(
  executionId: string,
  params?: EvidenceQueryParams,
): Promise<PaginatedResponse<EvidenceRecord>> {
  const searchParams: Record<string, string> = {};

  if (params?.page != null) searchParams.page = String(params.page);
  if (params?.limit != null) searchParams.limit = String(params.limit);
  if (params?.stepId) searchParams.stepId = params.stepId;
  if (params?.sourceType) searchParams.sourceType = params.sourceType;
  if (params?.nodeId) searchParams.nodeId = params.nodeId;

  return apiClient
    .get(`executions/${executionId}/evidence`, { searchParams })
    .json<PaginatedResponse<EvidenceRecord>>();
}

export async function fetchAllEvidenceByExecution(
  executionId: string,
  params?: Omit<EvidenceQueryParams, 'page' | 'limit'>,
): Promise<EvidenceRecord[]> {
  const records: EvidenceRecord[] = [];
  let page = 1;

  while (true) {
    const response = await fetchEvidenceByExecution(executionId, {
      ...params,
      page,
      limit: MAX_EVIDENCE_PAGE_SIZE,
    });

    records.push(...response.data);

    if (page >= Math.max(response.meta.totalPages, 1)) {
      return records;
    }

    page += 1;
  }
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
