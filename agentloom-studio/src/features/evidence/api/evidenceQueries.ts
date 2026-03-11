import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiResponse } from '@/shared/types/api';

import type { EvidenceQueryParams } from '../types';
import { fetchDocumentContent } from './documentApi';
import type { DocumentContentResult } from './documentApi';
import {
  fetchAllEvidenceByExecution,
  fetchEvidenceById,
  fetchEvidenceByExecution,
  fetchEvidenceChain,
  verifyEvidenceHash,
} from './evidenceApi';
import { evidenceKeys } from './evidenceKeys';

export function useEvidenceList(
  executionId: string,
  params?: EvidenceQueryParams,
) {
  return useQuery({
    queryKey: evidenceKeys.list(executionId, params as Record<string, unknown>),
    queryFn: () => fetchEvidenceByExecution(executionId, params),
    enabled: !!executionId,
  });
}

export function useAllEvidenceRecords(
  executionId: string,
  params?: Omit<EvidenceQueryParams, 'page' | 'limit'>,
) {
  return useQuery({
    queryKey: evidenceKeys.allRecords(
      executionId,
      params as Record<string, unknown>,
    ),
    queryFn: () => fetchAllEvidenceByExecution(executionId, params),
    enabled: !!executionId,
  });
}

export function useEvidenceDetail(
  executionId: string,
  evidenceId: string | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? (!!executionId && !!evidenceId);
  const safeEvidenceId = evidenceId ?? 'unknown';

  return useQuery({
    queryKey: evidenceKeys.detail(executionId, safeEvidenceId),
    queryFn: () => {
      if (!evidenceId) throw new Error('evidenceId is required');
      return fetchEvidenceById(executionId, evidenceId);
    },
    enabled,
  });
}

export function useEvidenceVerify(
  executionId: string,
  evidenceId: string | undefined,
) {
  const safeEvidenceId = evidenceId ?? 'unknown';

  return useQuery({
    queryKey: [...evidenceKeys.detail(executionId, safeEvidenceId), 'verify'],
    queryFn: () => {
      if (!evidenceId) throw new Error('evidenceId is required');
      return verifyEvidenceHash(executionId, evidenceId);
    },
    enabled: false,
  });
}

export function useEvidenceChain(
  executionId: string,
  nodeId?: string,
) {
  return useQuery({
    queryKey: evidenceKeys.chain(executionId, nodeId),
    queryFn: () => fetchEvidenceChain(executionId, nodeId),
    enabled: !!executionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDocumentContent(
  knowledgeBaseId: string | undefined,
  documentId: string | undefined,
) {
  const queryClient = useQueryClient();
  const safeKnowledgeBaseId = knowledgeBaseId ?? 'unknown';
  const safeDocumentId = documentId ?? 'unknown';

  const cached =
    knowledgeBaseId && documentId
      ? queryClient.getQueryData<ApiResponse<DocumentContentResult>>(
          evidenceKeys.documentContent(knowledgeBaseId, documentId),
        )
      : undefined;

  const expiresInSeconds = cached?.data?.expiresIn ?? 3600;
  const staleTime = Math.floor(expiresInSeconds * 0.8 * 1000);

  return useQuery({
    queryKey: evidenceKeys.documentContent(safeKnowledgeBaseId, safeDocumentId),
    queryFn: () => {
      if (!knowledgeBaseId || !documentId) {
        throw new Error('knowledgeBaseId and documentId are required');
      }

      return fetchDocumentContent(knowledgeBaseId, documentId);
    },
    enabled: !!knowledgeBaseId && !!documentId,
    staleTime,
  });
}
