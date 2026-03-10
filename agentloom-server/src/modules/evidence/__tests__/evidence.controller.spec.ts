import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { EvidenceController } from '../evidence.controller';

// -- Mock setup --

const { createMockEvidenceService } = vi.hoisted(() => {
  const createMockEvidenceService = () => ({
    findByExecution: vi.fn(),
    findById: vi.fn(),
    verifyContentHash: vi.fn(),
    createEvidenceRecord: vi.fn(),
    createBatchEvidenceRecords: vi.fn(),
  });

  return { createMockEvidenceService };
});

// -- Test constants --

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const EXECUTION_ID = '22222222-2222-2222-2222-222222222222';
const EVIDENCE_ID = '44444444-4444-4444-4444-444444444444';

const EXPECTED_ROLES = ['viewer', 'operator', 'creator', 'admin', 'owner'];

// -- Tests --

describe('EvidenceController', () => {
  let controller: EvidenceController;
  let mockService: ReturnType<typeof createMockEvidenceService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockEvidenceService();
    controller = new EvidenceController(mockService as never);
  });

  describe('findByExecution', () => {
    it('should return paginated evidence records', async () => {
      const paginatedResult = {
        data: [{ id: 'rec-1' }, { id: 'rec-2' }],
        meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      };
      mockService.findByExecution.mockResolvedValue(paginatedResult);

      const query = { page: 1, limit: 20 };
      const result = await controller.findByExecution(
        TENANT_ID,
        EXECUTION_ID,
        query as any,
      );

      expect(result).toEqual(paginatedResult);
      expect(mockService.findByExecution).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        query,
      );
    });

    it('should pass stepId filter to service', async () => {
      const stepId = '33333333-3333-3333-3333-333333333333';
      mockService.findByExecution.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      });

      const query = { page: 1, limit: 20, stepId };
      await controller.findByExecution(TENANT_ID, EXECUTION_ID, query as any);

      expect(mockService.findByExecution).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        query,
      );
    });

    it('should have correct roles', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        EvidenceController.prototype.findByExecution,
      );
      expect(roles).toEqual(EXPECTED_ROLES);
    });
  });

  describe('findById', () => {
    it('should return evidence record wrapped in data', async () => {
      const mockRecord = { id: EVIDENCE_ID, sourceType: 'rag_retrieval' };
      mockService.findById.mockResolvedValue(mockRecord);

      const result = await controller.findById(
        TENANT_ID,
        EXECUTION_ID,
        EVIDENCE_ID,
      );

      expect(result).toEqual({ data: mockRecord });
      expect(mockService.findById).toHaveBeenCalledWith(
        TENANT_ID,
        EVIDENCE_ID,
      );
    });

    it('should have correct roles', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        EvidenceController.prototype.findById,
      );
      expect(roles).toEqual(EXPECTED_ROLES);
    });
  });

  describe('verifyContentHash', () => {
    it('should return verification result wrapped in data', async () => {
      const verifyResult = { valid: true, evidenceId: EVIDENCE_ID };
      mockService.verifyContentHash.mockResolvedValue(verifyResult);

      const result = await controller.verifyContentHash(
        TENANT_ID,
        EXECUTION_ID,
        EVIDENCE_ID,
      );

      expect(result).toEqual({
        data: { evidenceId: EVIDENCE_ID, valid: verifyResult },
      });
      expect(mockService.verifyContentHash).toHaveBeenCalledWith(
        TENANT_ID,
        EVIDENCE_ID,
      );
    });

    it('should propagate service exceptions', async () => {
      mockService.verifyContentHash.mockRejectedValue(
        new Error('Integrity violation'),
      );

      await expect(
        controller.verifyContentHash(TENANT_ID, EXECUTION_ID, EVIDENCE_ID),
      ).rejects.toThrow('Integrity violation');
    });

    it('should have correct roles', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        EvidenceController.prototype.verifyContentHash,
      );
      expect(roles).toEqual(EXPECTED_ROLES);
    });
  });
});
