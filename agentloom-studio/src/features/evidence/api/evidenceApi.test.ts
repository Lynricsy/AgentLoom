import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEvidenceExport,
  fetchAllEvidenceByExecution,
  fetchEvidenceExportDownloadDetail,
  fetchEvidenceExportJob,
  fetchEvidenceById,
  fetchEvidenceByExecution,
  fetchEvidenceChain,
  refreshEvidenceExportDownloadDetail,
  verifyEvidenceHash,
} from './evidenceApi';

const { getMock, postMock, toSnakeBodyMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  toSnakeBodyMock: vi.fn((value) => value),
}));

vi.mock('@/shared/api/client', () => ({
  apiClient: { get: getMock, post: postMock },
  toSnakeBody: toSnakeBodyMock,
}));

const EXECUTION_ID = 'exec-001';
const EVIDENCE_ID = 'ev-001';

describe('evidenceApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchEvidenceByExecution', () => {
    it('should fetch paginated evidence records', async () => {
      const response = {
        data: [{ id: 'ev-1' }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      };
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(response),
      });

      const result = await fetchEvidenceByExecution(EXECUTION_ID);

      expect(getMock).toHaveBeenCalledWith(
        `executions/${EXECUTION_ID}/evidence`,
        { searchParams: {} },
      );
      expect(result).toEqual(response);
    });

    it('should pass query params as searchParams', async () => {
      const response = { data: [], meta: { page: 2, pageSize: 10, total: 0, totalPages: 0 } };
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(response),
      });

      await fetchEvidenceByExecution(EXECUTION_ID, {
        page: 2,
        limit: 10,
        stepId: 'step-1',
      });

      expect(getMock).toHaveBeenCalledWith(
        `executions/${EXECUTION_ID}/evidence`,
        {
          searchParams: {
            page: '2',
            limit: '10',
            stepId: 'step-1',
          },
        },
      );
    });

    it('should pass sourceType and nodeId filters', async () => {
      const response = { data: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } };
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(response),
      });

      await fetchEvidenceByExecution(EXECUTION_ID, {
        sourceType: 'agent_decision',
        nodeId: 'node-1',
      });

      expect(getMock).toHaveBeenCalledWith(
        `executions/${EXECUTION_ID}/evidence`,
        {
          searchParams: {
            sourceType: 'agent_decision',
            nodeId: 'node-1',
          },
        },
      );
    });
  });

  describe('fetchAllEvidenceByExecution', () => {
    it('should fetch all pages with max page size', async () => {
      const page1 = {
        data: [{ id: 'ev-1' }, { id: 'ev-2' }],
        meta: { page: 1, pageSize: 100, total: 102, totalPages: 2 },
      };
      const page2 = {
        data: [{ id: 'ev-3' }],
        meta: { page: 2, pageSize: 100, total: 102, totalPages: 2 },
      };

      getMock
        .mockReturnValueOnce({ json: vi.fn().mockResolvedValue(page1) })
        .mockReturnValueOnce({ json: vi.fn().mockResolvedValue(page2) });

      const result = await fetchAllEvidenceByExecution(EXECUTION_ID, {
        sourceType: 'tool_output',
        nodeId: 'node-2',
      });

      expect(getMock).toHaveBeenNthCalledWith(
        1,
        `executions/${EXECUTION_ID}/evidence`,
        {
          searchParams: {
            page: '1',
            limit: '100',
            sourceType: 'tool_output',
            nodeId: 'node-2',
          },
        },
      );
      expect(getMock).toHaveBeenNthCalledWith(
        2,
        `executions/${EXECUTION_ID}/evidence`,
        {
          searchParams: {
            page: '2',
            limit: '100',
            sourceType: 'tool_output',
            nodeId: 'node-2',
          },
        },
      );
      expect(result).toEqual([...page1.data, ...page2.data]);
    });
  });

  describe('fetchEvidenceById', () => {
    it('should fetch a single evidence record', async () => {
      const response = { data: { id: EVIDENCE_ID, sourceType: 'rag_retrieval' } };
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(response),
      });

      const result = await fetchEvidenceById(EXECUTION_ID, EVIDENCE_ID);

      expect(getMock).toHaveBeenCalledWith(
        `executions/${EXECUTION_ID}/evidence/${EVIDENCE_ID}`,
      );
      expect(result).toEqual(response);
    });
  });

  describe('verifyEvidenceHash', () => {
    it('should verify evidence hash integrity', async () => {
      const response = {
        data: {
          evidenceId: EVIDENCE_ID,
          valid: true,
          integrityWarning: false,
          currentHash: 'a'.repeat(64),
        },
      };
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(response),
      });

      const result = await verifyEvidenceHash(EXECUTION_ID, EVIDENCE_ID);

      expect(getMock).toHaveBeenCalledWith(
        `executions/${EXECUTION_ID}/evidence/${EVIDENCE_ID}/verify`,
      );
      expect(result).toEqual(response);
    });
  });

  describe('fetchEvidenceChain', () => {
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

    it('should fetch evidence chain without nodeId', async () => {
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(chainResponse),
      });

      const result = await fetchEvidenceChain(EXECUTION_ID);

      expect(getMock).toHaveBeenCalledWith(
        `executions/${EXECUTION_ID}/evidence/chain`,
        { searchParams: {} },
      );
      expect(result).toEqual(chainResponse);
    });

    it('should fetch evidence chain with nodeId', async () => {
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(chainResponse),
      });

      const nodeId = 'node-abc';
      const result = await fetchEvidenceChain(EXECUTION_ID, nodeId);

      expect(getMock).toHaveBeenCalledWith(
        `executions/${EXECUTION_ID}/evidence/chain`,
        { searchParams: { nodeId } },
      );
      expect(result).toEqual(chainResponse);
    });

    it('should return chain response with integrity issues', async () => {
      const responseWithIssues = {
        data: {
          roots: [
            {
              ...chainNode,
              sourceModified: true,
              unavailableReason: '来源已修改—原始文档内容发生变化',
              originalSnapshot: 'Original semantic snapshot',
            },
          ],
          chainCompleteness: 0.8,
          totalNodes: 5,
          integrityStatus: {
            chainCompleteness: 0.8,
            totalNodes: 5,
            nodesWithPhysicalLocation: 4,
            completenessLabel: 'evidence_completeness: 0.80',
            integrityIssues: [
              {
                evidenceId: 'ev-2',
                issueType: 'source_modified',
                description: '来源已修改—原始文档内容发生变化',
              },
            ],
          },
          cachedAt: '2026-03-10T10:05:00.000Z',
        },
      };
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(responseWithIssues),
      });

      const result = await fetchEvidenceChain(EXECUTION_ID);

      expect(result).toEqual(responseWithIssues);
    });
  });

  describe('evidence exports', () => {
    const EXPORT_ID = 'export-1';
    const exportFilters = {
      from: '2026-03-17T08:00:00.000Z',
      to: '2026-03-17T09:00:00.000Z',
      eventType: 'workflow.updated',
      resourceType: 'workflow_definition',
      resourceId: 'wf-1',
      executionId: 'exec-1',
      actorType: 'user' as const,
      actorId: 'user-1',
    };

    it('should create an evidence export job with snake-cased filters', async () => {
      const response = {
        data: {
          id: EXPORT_ID,
          status: 'queued',
          matchedExecutionCount: 1,
        },
      };
      postMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(response),
      });

      const result = await createEvidenceExport(exportFilters);

      expect(toSnakeBodyMock).toHaveBeenCalledWith(exportFilters);
      expect(postMock).toHaveBeenCalledWith('evidence-exports', {
        json: exportFilters,
      });
      expect(result).toEqual(response);
    });

    it('should fetch a single evidence export job', async () => {
      const response = {
        data: {
          id: EXPORT_ID,
          status: 'completed',
          matchedExecutionCount: 2,
        },
      };
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(response),
      });

      const result = await fetchEvidenceExportJob(EXPORT_ID);

      expect(getMock).toHaveBeenCalledWith(`evidence-exports/${EXPORT_ID}`);
      expect(result).toEqual(response);
    });

    it('should fetch download detail for a completed evidence export job', async () => {
      const response = {
        data: {
          url: 'https://download.example/export-1',
          fileName: 'evidence-export-1.zip',
          mimeType: 'application/zip',
          expiresAt: '2026-03-17T12:30:00.000Z',
          expiresIn: 600,
        },
      };
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(response),
      });

      const result = await fetchEvidenceExportDownloadDetail(EXPORT_ID);

      expect(getMock).toHaveBeenCalledWith(
        `evidence-exports/${EXPORT_ID}/download`,
      );
      expect(result).toEqual(response);
    });

    it('should refresh download detail for a completed evidence export job', async () => {
      const response = {
        data: {
          url: 'https://download.example/export-1?refresh=1',
          fileName: 'evidence-export-1.zip',
          mimeType: 'application/zip',
          expiresAt: '2026-03-17T12:40:00.000Z',
          expiresIn: 600,
        },
      };
      postMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(response),
      });

      const result = await refreshEvidenceExportDownloadDetail(EXPORT_ID);

      expect(postMock).toHaveBeenCalledWith(
        `evidence-exports/${EXPORT_ID}/download/refresh`,
      );
      expect(result).toEqual(response);
    });
  });
});
