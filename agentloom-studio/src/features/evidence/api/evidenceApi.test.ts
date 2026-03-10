import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchEvidenceById,
  fetchEvidenceByExecution,
  fetchEvidenceChain,
  verifyEvidenceHash,
} from './evidenceApi';

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock('@/shared/api/client', () => ({
  apiClient: { get: getMock },
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
        { searchParams: { page: '2', limit: '10', stepId: 'step-1' } },
      );
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
    const chainResponse = {
      data: {
        roots: [],
        chainCompleteness: 1.0,
        totalNodes: 0,
        integrityIssues: [],
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
          roots: [{ evidenceId: 'ev-1', children: [] }],
          chainCompleteness: 0.8,
          totalNodes: 5,
          integrityIssues: [
            { evidenceId: 'ev-2', issue: 'Hash mismatch', severity: 'error' },
          ],
        },
      };
      getMock.mockReturnValue({
        json: vi.fn().mockResolvedValue(responseWithIssues),
      });

      const result = await fetchEvidenceChain(EXECUTION_ID);

      expect(result).toEqual(responseWithIssues);
    });
  });
});
