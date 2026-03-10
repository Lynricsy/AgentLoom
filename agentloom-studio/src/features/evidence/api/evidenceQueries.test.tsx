import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchEvidenceByExecution,
  fetchEvidenceById,
  fetchEvidenceChain,
  verifyEvidenceHash,
} from './evidenceApi';
import {
  useEvidenceChain,
  useEvidenceDetail,
  useEvidenceList,
  useEvidenceVerify,
} from './evidenceQueries';

vi.mock('./evidenceApi', () => ({
  fetchEvidenceByExecution: vi.fn(),
  fetchEvidenceById: vi.fn(),
  fetchEvidenceChain: vi.fn(),
  verifyEvidenceHash: vi.fn(),
}));

const EXECUTION_ID = 'exec-001';
const EVIDENCE_ID = 'ev-001';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('evidence queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useEvidenceList', () => {
    it('should fetch evidence list when executionId is provided', async () => {
      const response = {
        data: [{ id: 'ev-1', sourceType: 'rag_retrieval' }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      };
      vi.mocked(fetchEvidenceByExecution).mockResolvedValue(response as never);

      const { result } = renderHook(
        () => useEvidenceList(EXECUTION_ID),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchEvidenceByExecution).toHaveBeenCalledWith(
        EXECUTION_ID,
        undefined,
      );
      expect(result.current.data).toEqual(response);
    });

    it('should not fetch when executionId is empty', () => {
      const { result } = renderHook(
        () => useEvidenceList(''),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchEvidenceByExecution).not.toHaveBeenCalled();
    });
  });

  describe('useEvidenceDetail', () => {
    it('should fetch evidence detail when both IDs are provided', async () => {
      const response = { data: { id: EVIDENCE_ID, sourceType: 'rag_retrieval' } };
      vi.mocked(fetchEvidenceById).mockResolvedValue(response as never);

      const { result } = renderHook(
        () => useEvidenceDetail(EXECUTION_ID, EVIDENCE_ID),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchEvidenceById).toHaveBeenCalledWith(EXECUTION_ID, EVIDENCE_ID);
      expect(result.current.data).toEqual(response);
    });

    it('should not fetch when evidenceId is undefined', () => {
      const { result } = renderHook(
        () => useEvidenceDetail(EXECUTION_ID, undefined),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchEvidenceById).not.toHaveBeenCalled();
    });
  });

  describe('useEvidenceVerify', () => {
    it('should stay idle until refetch is called', () => {
      const { result } = renderHook(
        () => useEvidenceVerify(EXECUTION_ID, EVIDENCE_ID),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(verifyEvidenceHash).not.toHaveBeenCalled();
    });

    it('should verify evidence hash on refetch', async () => {
      const response = {
        data: {
          evidenceId: EVIDENCE_ID,
          valid: false,
          integrityWarning: true,
        },
      };
      vi.mocked(verifyEvidenceHash).mockResolvedValue(response as never);

      const { result } = renderHook(
        () => useEvidenceVerify(EXECUTION_ID, EVIDENCE_ID),
        { wrapper: createWrapper() },
      );

      const queryResult = await result.current.refetch();

      expect(verifyEvidenceHash).toHaveBeenCalledWith(
        EXECUTION_ID,
        EVIDENCE_ID,
      );
      expect(queryResult.isSuccess).toBe(true);
      expect(queryResult.data).toEqual(response);
    });
  });

  describe('useEvidenceChain', () => {
    const chainResponse = {
      data: {
        roots: [{ evidenceId: 'ev-1', children: [] }],
        chainCompleteness: 1.0,
        totalNodes: 1,
        integrityIssues: [],
      },
    };

    it('should fetch evidence chain when executionId is provided', async () => {
      vi.mocked(fetchEvidenceChain).mockResolvedValue(chainResponse as never);

      const { result } = renderHook(
        () => useEvidenceChain(EXECUTION_ID),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchEvidenceChain).toHaveBeenCalledWith(EXECUTION_ID, undefined);
      expect(result.current.data).toEqual(chainResponse);
    });

    it('should not fetch when executionId is empty', () => {
      const { result } = renderHook(
        () => useEvidenceChain(''),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchEvidenceChain).not.toHaveBeenCalled();
    });

    it('should pass nodeId to API function', async () => {
      vi.mocked(fetchEvidenceChain).mockResolvedValue(chainResponse as never);

      const nodeId = 'node-abc';
      const { result } = renderHook(
        () => useEvidenceChain(EXECUTION_ID, nodeId),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchEvidenceChain).toHaveBeenCalledWith(EXECUTION_ID, nodeId);
    });
  });
});
