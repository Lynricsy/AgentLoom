import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useEvidenceDetail, useEvidenceList } from './evidenceQueries';

vi.mock('./evidenceApi', () => ({
  fetchEvidenceByExecution: vi.fn(),
  fetchEvidenceById: vi.fn(),
  verifyEvidenceHash: vi.fn(),
}));

import {
  fetchEvidenceById,
  fetchEvidenceByExecution,
} from './evidenceApi';

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

const EXECUTION_ID = 'exec-001';
const EVIDENCE_ID = 'ev-001';

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
});
