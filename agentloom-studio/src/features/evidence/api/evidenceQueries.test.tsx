import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEvidenceExport,
  fetchAllEvidenceByExecution,
  fetchEvidenceExportDownloadDetail,
  fetchEvidenceExportJob,
  fetchEvidenceByExecution,
  fetchEvidenceById,
  fetchEvidenceChain,
  refreshEvidenceExportDownloadDetail,
  verifyEvidenceHash,
} from './evidenceApi';
import { evidenceKeys } from './evidenceKeys';
import {
  useAllEvidenceRecords,
  useCreateEvidenceExport,
  useEvidenceChain,
  useEvidenceDetail,
  useEvidenceExportDownloadDetail,
  useEvidenceExportJob,
  useEvidenceList,
  useRefreshEvidenceExportDownloadDetail,
  useEvidenceVerify,
} from './evidenceQueries';

vi.mock('./evidenceApi', () => ({
  createEvidenceExport: vi.fn(),
  fetchAllEvidenceByExecution: vi.fn(),
  fetchEvidenceExportDownloadDetail: vi.fn(),
  fetchEvidenceExportJob: vi.fn(),
  fetchEvidenceByExecution: vi.fn(),
  fetchEvidenceById: vi.fn(),
  fetchEvidenceChain: vi.fn(),
  refreshEvidenceExportDownloadDetail: vi.fn(),
  verifyEvidenceHash: vi.fn(),
}));

const EXECUTION_ID = 'exec-001';
const EVIDENCE_ID = 'ev-001';
const EXPORT_ID = 'export-1';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return {
    queryClient,
    wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    },
  };
}

describe('evidence queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('useEvidenceList', () => {
    it('should fetch evidence list when executionId is provided', async () => {
      const response = {
        data: [{ id: 'ev-1', sourceType: 'rag_retrieval' }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      };
      vi.mocked(fetchEvidenceByExecution).mockResolvedValue(response as never);
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useEvidenceList(EXECUTION_ID),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchEvidenceByExecution).toHaveBeenCalledWith(
        EXECUTION_ID,
        undefined,
      );
      expect(result.current.data).toEqual(response);
    });

    it('should not fetch when executionId is empty', () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useEvidenceList(''),
        { wrapper },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchEvidenceByExecution).not.toHaveBeenCalled();
    });
  });

  describe('useAllEvidenceRecords', () => {
    it('should fetch all evidence records when executionId is provided', async () => {
      const response = [{ id: 'ev-1', sourceType: 'rag_retrieval' }];
      vi.mocked(fetchAllEvidenceByExecution).mockResolvedValue(response as never);
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useAllEvidenceRecords(EXECUTION_ID, { nodeId: 'node-1' }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchAllEvidenceByExecution).toHaveBeenCalledWith(
        EXECUTION_ID,
        { nodeId: 'node-1' },
      );
      expect(result.current.data).toEqual(response);
    });

    it('should not fetch all evidence records when executionId is empty', () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useAllEvidenceRecords(''),
        { wrapper },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchAllEvidenceByExecution).not.toHaveBeenCalled();
    });
  });

  describe('useEvidenceDetail', () => {
    it('should fetch evidence detail when both IDs are provided', async () => {
      const response = { data: { id: EVIDENCE_ID, sourceType: 'rag_retrieval' } };
      vi.mocked(fetchEvidenceById).mockResolvedValue(response as never);
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useEvidenceDetail(EXECUTION_ID, EVIDENCE_ID),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchEvidenceById).toHaveBeenCalledWith(EXECUTION_ID, EVIDENCE_ID);
      expect(result.current.data).toEqual(response);
    });

    it('should not fetch when evidenceId is undefined', () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useEvidenceDetail(EXECUTION_ID, undefined),
        { wrapper },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchEvidenceById).not.toHaveBeenCalled();
    });
  });

  describe('useEvidenceVerify', () => {
    it('should stay idle until refetch is called', () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useEvidenceVerify(EXECUTION_ID, EVIDENCE_ID),
        { wrapper },
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
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useEvidenceVerify(EXECUTION_ID, EVIDENCE_ID),
        { wrapper },
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
    const chainNode = {
      evidenceId: 'ev-1',
      executionId: EXECUTION_ID,
      stepId: 'step-1',
      sourceType: 'rag_retrieval',
      packetSummary: {
        title: 'RAG 检索 · knowledge.md',
        excerpt: 'Retrieved chunk content',
        metadata: {
          documentId: 'doc-1',
          chunkId: 'chunk-1',
        },
      },
      contentHash: 'f'.repeat(64),
      parentEvidenceId: null,
      createdAt: '2026-03-10T10:00:00.000Z',
      depth: 0,
      hashValid: true,
      children: [],
    };
    const chainResponse = {
      data: {
        roots: [chainNode],
        chainCompleteness: 1.0,
        totalNodes: 1,
        integrityStatus: {
          chainCompleteness: 1.0,
          totalNodes: 1,
          nodesWithPhysicalLocation: 1,
          completenessLabel: 'complete',
          integrityIssues: [],
        },
        cachedAt: '2026-03-10T10:00:00.000Z',
      },
    };

    it('should fetch evidence chain when executionId is provided', async () => {
      vi.mocked(fetchEvidenceChain).mockResolvedValue(chainResponse as never);
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useEvidenceChain(EXECUTION_ID),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchEvidenceChain).toHaveBeenCalledWith(EXECUTION_ID, undefined);
      expect(result.current.data).toEqual(chainResponse);
    });

    it('should not fetch when executionId is empty', () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(
        () => useEvidenceChain(''),
        { wrapper },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(fetchEvidenceChain).not.toHaveBeenCalled();
    });

    it('should pass nodeId to API function', async () => {
      vi.mocked(fetchEvidenceChain).mockResolvedValue(chainResponse as never);
      const { wrapper } = createWrapper();

      const nodeId = 'node-abc';
      const { result } = renderHook(
        () => useEvidenceChain(EXECUTION_ID, nodeId),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchEvidenceChain).toHaveBeenCalledWith(EXECUTION_ID, nodeId);
    });
  });

  describe('evidence export queries', () => {
    const exportJobResponse = {
      data: {
        id: EXPORT_ID,
        status: 'completed',
        matchedExecutionCount: 2,
      },
    };

    const downloadDetailResponse = {
      data: {
        url: 'https://download.example/export-1',
        fileName: 'evidence-export-1.zip',
        mimeType: 'application/zip',
        expiresAt: '2026-03-17T12:30:00.000Z',
        expiresIn: 600,
      },
    };

    it('should create an export job and seed the job cache', async () => {
      const { queryClient, wrapper } = createWrapper();
      const filters = { eventType: 'workflow.updated', executionId: 'exec-1' };
      vi.mocked(createEvidenceExport).mockResolvedValue(exportJobResponse as never);

      const { result } = renderHook(() => useCreateEvidenceExport(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(filters);
      });

      expect(createEvidenceExport).toHaveBeenCalledWith(filters);
      expect(queryClient.getQueryData(evidenceKeys.exportJob(EXPORT_ID))).toEqual(
        exportJobResponse,
      );
    });

    it('should fetch export job detail when exportId is provided', async () => {
      vi.mocked(fetchEvidenceExportJob).mockResolvedValue(exportJobResponse as never);
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useEvidenceExportJob(EXPORT_ID), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchEvidenceExportJob).toHaveBeenCalledWith(EXPORT_ID);
      expect(result.current.data).toEqual(exportJobResponse);
    });

    it('should poll queued export jobs until they reach a terminal state', async () => {
      vi.useFakeTimers();
      vi.mocked(fetchEvidenceExportJob).mockResolvedValue({
        data: {
          id: EXPORT_ID,
          status: 'queued',
          matchedExecutionCount: 2,
        },
      } as never);
      const { wrapper } = createWrapper();

      renderHook(() => useEvidenceExportJob(EXPORT_ID), {
        wrapper,
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(fetchEvidenceExportJob).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(5_000);
        await Promise.resolve();
      });

      expect(fetchEvidenceExportJob).toHaveBeenCalledTimes(2);
    });

    it('should stop polling once an export job is completed', async () => {
      vi.useFakeTimers();
      vi.mocked(fetchEvidenceExportJob).mockResolvedValue(exportJobResponse as never);
      const { wrapper } = createWrapper();

      renderHook(() => useEvidenceExportJob(EXPORT_ID), {
        wrapper,
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(fetchEvidenceExportJob).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(5_000);
        await Promise.resolve();
      });

      expect(fetchEvidenceExportJob).toHaveBeenCalledTimes(1);
    });

    it('should reuse cached download detail until it becomes stale', () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(
        evidenceKeys.exportDownloadDetail(EXPORT_ID),
        downloadDetailResponse,
      );

      const { result } = renderHook(
        () => useEvidenceExportDownloadDetail(EXPORT_ID),
        { wrapper },
      );

      expect(result.current.data).toEqual(downloadDetailResponse);
      expect(fetchEvidenceExportDownloadDetail).not.toHaveBeenCalled();
    });

    it('should refresh download detail and update the download cache', async () => {
      const refreshedResponse = {
        data: {
          ...downloadDetailResponse.data,
          url: 'https://download.example/export-1?refresh=1',
          expiresAt: '2026-03-17T12:40:00.000Z',
        },
      };
      const { queryClient, wrapper } = createWrapper();
      vi.mocked(refreshEvidenceExportDownloadDetail).mockResolvedValue(
        refreshedResponse as never,
      );

      const { result } = renderHook(
        () => useRefreshEvidenceExportDownloadDetail(EXPORT_ID),
        { wrapper },
      );

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(refreshEvidenceExportDownloadDetail).toHaveBeenCalledWith(EXPORT_ID);
      expect(
        queryClient.getQueryData(evidenceKeys.exportDownloadDetail(EXPORT_ID)),
      ).toEqual(refreshedResponse);
    });
  });
});
