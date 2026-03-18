import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiResponse } from '@/shared/types/api';

import type {
  EvidenceExportDownloadDetail,
  EvidenceExportRequest,
  EvidenceQueryParams,
} from '../types';
import { fetchDocumentContent } from './documentApi';
import type { DocumentContentResult } from './documentApi';
import {
  createEvidenceExport,
  fetchAllEvidenceByExecution,
  fetchEvidenceExportDownloadDetail,
  fetchEvidenceExportJob,
  fetchEvidenceById,
  fetchEvidenceByExecution,
  fetchEvidenceChain,
  fetchEvidenceGraph,
  refreshEvidenceExportDownloadDetail,
  verifyEvidenceHash,
} from './evidenceApi';
import { evidenceKeys } from './evidenceKeys';

const EVIDENCE_EXPORT_JOB_POLL_INTERVAL_MS = 5_000;

function shouldPollEvidenceExportJob(status: string | undefined): boolean {
  return status === 'queued' || status === 'running';
}

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

export function useEvidenceGraph(executionId: string) {
  return useQuery({
    queryKey: evidenceKeys.graph(executionId),
    queryFn: () => fetchEvidenceGraph(executionId),
    enabled: !!executionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateEvidenceExport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...evidenceKeys.exportJobs(), 'create'],
    mutationFn: (request: EvidenceExportRequest) => createEvidenceExport(request),
    onSuccess: (response) => {
      queryClient.setQueryData(evidenceKeys.exportJob(response.data.id), response);
    },
    gcTime: 0,
  });
}

export function useEvidenceExportJob(
  exportId: string | undefined,
  options?: { enabled?: boolean },
) {
  const safeExportId = exportId ?? 'unknown';

  return useQuery({
    queryKey: evidenceKeys.exportJob(safeExportId),
    queryFn: () => {
      if (!exportId) {
        throw new Error('exportId is required');
      }

      return fetchEvidenceExportJob(exportId);
    },
    enabled: Boolean(exportId) && (options?.enabled ?? true),
    refetchInterval: (query) =>
      shouldPollEvidenceExportJob(query.state.data?.data.status)
        ? EVIDENCE_EXPORT_JOB_POLL_INTERVAL_MS
        : false,
  });
}

export function useEvidenceExportDownloadDetail(
  exportId: string | undefined,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();
  const safeExportId = exportId ?? 'unknown';
  const cached = exportId
    ? queryClient.getQueryData<ApiResponse<EvidenceExportDownloadDetail>>(
        evidenceKeys.exportDownloadDetail(exportId),
      )
    : undefined;
  const expiresInSeconds = cached?.data?.expiresIn ?? 3600;
  const staleTime = Math.floor(expiresInSeconds * 0.8 * 1000);

  return useQuery({
    queryKey: evidenceKeys.exportDownloadDetail(safeExportId),
    queryFn: () => {
      if (!exportId) {
        throw new Error('exportId is required');
      }

      return fetchEvidenceExportDownloadDetail(exportId);
    },
    enabled: Boolean(exportId) && (options?.enabled ?? true),
    staleTime,
  });
}

export function useRefreshEvidenceExportDownloadDetail(
  exportId: string | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...evidenceKeys.exportDownloadDetail(exportId ?? 'unknown'), 'refresh'],
    mutationFn: () => {
      if (!exportId) {
        throw new Error('exportId is required');
      }

      return refreshEvidenceExportDownloadDetail(exportId);
    },
    onSuccess: (response) => {
      if (!exportId) {
        return;
      }

      queryClient.setQueryData(
        evidenceKeys.exportDownloadDetail(exportId),
        response,
      );
    },
    gcTime: 0,
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
