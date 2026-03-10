import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchEvidenceById,
  fetchEvidenceByExecution,
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
});
