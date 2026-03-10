import { useQuery } from '@tanstack/react-query';

import type { EvidenceQueryParams } from '../types';
import {
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

export function useEvidenceDetail(
  executionId: string,
  evidenceId: string | undefined,
) {
  return useQuery({
    queryKey: evidenceKeys.detail(executionId, evidenceId!),
    queryFn: () => fetchEvidenceById(executionId, evidenceId!),
    enabled: !!executionId && !!evidenceId,
  });
}

export function useEvidenceVerify(
  executionId: string,
  evidenceId: string | undefined,
) {
  return useQuery({
    queryKey: [...evidenceKeys.detail(executionId, evidenceId!), 'verify'],
    queryFn: () => verifyEvidenceHash(executionId, evidenceId!),
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
