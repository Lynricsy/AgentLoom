import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { EvidenceController } from '../evidence.controller';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const EXECUTION_ID = '00000000-0000-4000-8000-000000000002';
const EVIDENCE_ID = '00000000-0000-4000-8000-000000000003';
const EXPECTED_ROLES = ['viewer', 'operator', 'creator', 'admin', 'owner'];

type EvidenceControllerHandlerName =
  | 'findByExecution'
  | 'getEvidenceChain'
  | 'findById'
  | 'verifyContentHash';

function getHandler(name: EvidenceControllerHandlerName): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    EvidenceController.prototype,
    name,
  );

  if (typeof descriptor?.value !== 'function') {
    throw new Error(`Handler ${name} is not defined on EvidenceController`);
  }

  return descriptor.value as object;
}

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

  it('should pass sourceType and nodeId filters to service', async () => {
    const response = {
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    };
    mockService.findByExecution.mockResolvedValue(response);

    await expect(
      controller.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 1,
        limit: 20,
        sourceType: 'agent_decision',
        nodeId: 'node-abc',
      }),
    ).resolves.toEqual(response);

    expect(mockService.findByExecution).toHaveBeenCalledWith(
      TENANT_ID,
      EXECUTION_ID,
      { page: 1, limit: 20, sourceType: 'agent_decision', nodeId: 'node-abc' },
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
      currentHash: 'a'.repeat(64),
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
      integrityStatus: {
        chainCompleteness: 1,
        totalNodes: 0,
        nodesWithPhysicalLocation: 0,
        completenessLabel: 'complete',
        integrityIssues: [],
      },
      cachedAt: '2026-03-10T10:00:00.000Z',
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
      response: {
        roots: [],
        chainCompleteness: 1,
        totalNodes: 0,
        integrityStatus: {
          chainCompleteness: 1,
          totalNodes: 0,
          nodesWithPhysicalLocation: 0,
          completenessLabel: 'complete',
          integrityIssues: [],
        },
        cachedAt: '2026-03-10T10:00:00.000Z',
      },
      cached: true,
    });
    const mockRes = { header: vi.fn() };

    await controller.getEvidenceChain(
      TENANT_ID,
      EXECUTION_ID,
      {},
      mockRes as never,
    );

    expect(mockRes.header).toHaveBeenCalledWith('X-Cache-Hit', 'true');
  });

  it('should set X-Cache-Hit: false header on cache miss', async () => {
    mockService.buildChain.mockResolvedValue({
      response: {
        roots: [],
        chainCompleteness: 1,
        totalNodes: 0,
        integrityStatus: {
          chainCompleteness: 1,
          totalNodes: 0,
          nodesWithPhysicalLocation: 0,
          completenessLabel: 'complete',
          integrityIssues: [],
        },
        cachedAt: '2026-03-10T10:00:00.000Z',
      },
      cached: false,
    });
    const mockRes = { header: vi.fn() };

    await controller.getEvidenceChain(
      TENANT_ID,
      EXECUTION_ID,
      {},
      mockRes as never,
    );

    expect(mockRes.header).toHaveBeenCalledWith('X-Cache-Hit', 'false');
  });

  it('should pass nodeId from query to service', async () => {
    const nodeId = 'node-abc';
    mockService.buildChain.mockResolvedValue({
      response: {
        roots: [],
        chainCompleteness: 1,
        totalNodes: 0,
        integrityStatus: {
          chainCompleteness: 1,
          totalNodes: 0,
          nodesWithPhysicalLocation: 0,
          completenessLabel: 'complete',
          integrityIssues: [],
        },
        cachedAt: '2026-03-10T10:00:00.000Z',
      },
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
      Reflect.getMetadata(ROLES_KEY, getHandler('findByExecution')),
    ).toEqual(EXPECTED_ROLES);
    expect(
      Reflect.getMetadata(ROLES_KEY, getHandler('getEvidenceChain')),
    ).toEqual(EXPECTED_ROLES);
    expect(Reflect.getMetadata(ROLES_KEY, getHandler('findById'))).toEqual(
      EXPECTED_ROLES,
    );
    expect(
      Reflect.getMetadata(ROLES_KEY, getHandler('verifyContentHash')),
    ).toEqual(EXPECTED_ROLES);
  });
});
