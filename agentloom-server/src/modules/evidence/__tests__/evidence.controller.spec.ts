import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { EvidenceController } from '../evidence.controller';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const EXECUTION_ID = '00000000-0000-4000-8000-000000000002';
const EVIDENCE_ID = '00000000-0000-4000-8000-000000000003';
const EXPECTED_ROLES = ['viewer', 'operator', 'creator', 'admin', 'owner'];

function createMockEvidenceService() {
  return {
    findByExecution: vi.fn(),
    findById: vi.fn(),
    verifyContentHash: vi.fn(),
    buildChain: vi.fn(),
  };
}

describe('EvidenceController', () => {
  let controller: EvidenceController;
  let mockService: ReturnType<typeof createMockEvidenceService>;

  beforeEach(() => {
    mockService = createMockEvidenceService();
    controller = new EvidenceController(mockService as never);
  });

  it('should delegate list queries with execution scope', async () => {
    const response = {
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    };
    mockService.findByExecution.mockResolvedValue(response);

    await expect(
      controller.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 1,
        limit: 20,
      }),
    ).resolves.toEqual(response);

    expect(mockService.findByExecution).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      { page: 1, limit: 20 },
    );
  });

  it('should return detail data scoped by executionId', async () => {
    const record = { id: EVIDENCE_ID, sourceType: 'rag_retrieval' };
    mockService.findById.mockResolvedValue(record);

    await expect(
      controller.findById(TENANT_ID, EXECUTION_ID, EVIDENCE_ID),
    ).resolves.toEqual({ data: record });

    expect(mockService.findById).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      EVIDENCE_ID,
    );
  });

  it('should return structured verification data', async () => {
    const verification = {
      evidenceId: EVIDENCE_ID,
      valid: false,
      integrityWarning: true,
    };
    mockService.verifyContentHash.mockResolvedValue(verification);

    await expect(
      controller.verifyContentHash(TENANT_ID, EXECUTION_ID, EVIDENCE_ID),
    ).resolves.toEqual({ data: verification });

    expect(mockService.verifyContentHash).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      EVIDENCE_ID,
    );
  });

  it('should delegate chain query to service.buildChain', async () => {
    const chainResponse = {
      roots: [],
      chainCompleteness: 1,
      totalNodes: 0,
      integrityIssues: [],
    };
    mockService.buildChain.mockResolvedValue({
      response: chainResponse,
      cached: false,
    });
    const mockRes = { header: vi.fn() };

    const result = await controller.getEvidenceChain(
      TENANT_ID,
      EXECUTION_ID,
      { nodeId: undefined },
      mockRes as never,
    );

    expect(mockService.buildChain).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      undefined,
    );
    expect(result).toEqual({ data: chainResponse });
  });

  it('should set X-Cache-Hit: true header on cache hit', async () => {
    mockService.buildChain.mockResolvedValue({
      response: { roots: [], chainCompleteness: 1, totalNodes: 0, integrityIssues: [] },
      cached: true,
    });
    const mockRes = { header: vi.fn() };

    await controller.getEvidenceChain(TENANT_ID, EXECUTION_ID, {}, mockRes as never);

    expect(mockRes.header).toHaveBeenCalledWith('X-Cache-Hit', 'true');
  });

  it('should set X-Cache-Hit: false header on cache miss', async () => {
    mockService.buildChain.mockResolvedValue({
      response: { roots: [], chainCompleteness: 1, totalNodes: 0, integrityIssues: [] },
      cached: false,
    });
    const mockRes = { header: vi.fn() };

    await controller.getEvidenceChain(TENANT_ID, EXECUTION_ID, {}, mockRes as never);

    expect(mockRes.header).toHaveBeenCalledWith('X-Cache-Hit', 'false');
  });

  it('should pass nodeId from query to service', async () => {
    const nodeId = '00000000-0000-4000-8000-000000000099';
    mockService.buildChain.mockResolvedValue({
      response: { roots: [], chainCompleteness: 1, totalNodes: 0, integrityIssues: [] },
      cached: false,
    });
    const mockRes = { header: vi.fn() };

    await controller.getEvidenceChain(
      TENANT_ID,
      EXECUTION_ID,
      { nodeId },
      mockRes as never,
    );

    expect(mockService.buildChain).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      nodeId,
    );
  });

  it('should expose viewer through owner roles on every endpoint', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, EvidenceController.prototype.findByExecution),
    ).toEqual(EXPECTED_ROLES);
    expect(
      Reflect.getMetadata(ROLES_KEY, EvidenceController.prototype.getEvidenceChain),
    ).toEqual(EXPECTED_ROLES);
    expect(
      Reflect.getMetadata(ROLES_KEY, EvidenceController.prototype.findById),
    ).toEqual(EXPECTED_ROLES);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        EvidenceController.prototype.verifyContentHash,
      ),
    ).toEqual(EXPECTED_ROLES);
  });
});
