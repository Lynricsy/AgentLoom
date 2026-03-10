import { createHash } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import {
  EvidencePacketSchema,
  QueryEvidenceSchema,
} from '../dto/evidence.dto';
import {
  EvidenceIntegrityException,
  EvidenceNotFoundException,
  InvalidEvidencePacketException,
} from '../evidence.exceptions';
import { EvidenceService } from '../evidence.service';

// -- Mock setup --

const { mockGetTenantDb, mockTenantDb } = vi.hoisted(() => {
  const mockTenantDb = {
    insert: vi.fn(),
    select: vi.fn(),
  };
  const mockGetTenantDb = vi.fn(() => mockTenantDb);
  return { mockGetTenantDb, mockTenantDb };
});

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mockGetTenantDb,
}));

// -- Test helpers --

const TENANT_ID = '11111111-1111-1111-a111-111111111111';
const EXECUTION_ID = '22222222-2222-2222-a222-222222222222';
const STEP_ID = '33333333-3333-3333-a333-333333333333';
const EVIDENCE_ID = '44444444-4444-4444-a444-444444444444';
const PARENT_EVIDENCE_ID = '55555555-5555-5555-a555-555555555555';

function createValidPacket(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: EVIDENCE_ID,
    sourceType: 'rag_retrieval' as const,
    physicalLocation: {
      documentId: 'doc-1',
      fileName: 'test.pdf',
      page: 1,
      paragraph: 2,
      offset: 100,
      length: 200,
      chunkId: 'chunk-1',
    },
    semanticLocation: {
      sectionTitle: 'Introduction',
      context: 'Some relevant context text',
      relevanceScore: 0.85,
    },
    contentHash:
      'a'.repeat(64),
    timestamp: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function computeExpectedHash(packet: unknown): string {
  const serialized = JSON.stringify(
    packet,
    Object.keys(packet as object).sort(),
  );
  return createHash('sha256').update(serialized).digest('hex');
}

function createMockRecord(overrides: Record<string, unknown> = {}) {
  const packet = createValidPacket();
  return {
    id: EVIDENCE_ID,
    executionId: EXECUTION_ID,
    stepId: STEP_ID,
    tenantId: TENANT_ID,
    sourceType: 'rag_retrieval',
    packet,
    contentHash: computeExpectedHash(packet),
    parentEvidenceId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function setupInsertReturning(resolveWith: unknown[]) {
  mockTenantDb.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(resolveWith),
    }),
  });
}

function setupSelectWhere(resolveWith: unknown[]) {
  mockTenantDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(resolveWith),
    }),
  });
}

function setupSelectPaginated(
  data: unknown[],
  total: number,
) {
  mockTenantDb.select
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(data),
            }),
          }),
        }),
      }),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total }]),
      }),
    });
}

// -- Tests --

describe('EvidenceService', () => {
  let service: EvidenceService;
  const mockDb = {};

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        EvidenceService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<EvidenceService>(EvidenceService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createEvidenceRecord', () => {
    it('should create a record with validated packet and computed hash', async () => {
      const dto = {
        stepId: STEP_ID,
        sourceType: 'rag_retrieval' as const,
        packet: createValidPacket(),
      };
      const mockRecord = createMockRecord();
      setupInsertReturning([mockRecord]);

      const result = await service.createEvidenceRecord(
        TENANT_ID,
        EXECUTION_ID,
        dto,
      );

      expect(result).toEqual(mockRecord);
      expect(mockGetTenantDb).toHaveBeenCalledWith(mockDb);
      expect(mockTenantDb.insert).toHaveBeenCalled();
    });

    it('should throw InvalidEvidencePacketException for invalid packet', async () => {
      const dto = {
        stepId: STEP_ID,
        sourceType: 'rag_retrieval' as const,
        packet: { invalid: 'data' } as any,
      };

      await expect(
        service.createEvidenceRecord(TENANT_ID, EXECUTION_ID, dto),
      ).rejects.toThrow(InvalidEvidencePacketException);
    });

    it('should set parentEvidenceId to null when not provided', async () => {
      const dto = {
        stepId: STEP_ID,
        sourceType: 'rag_retrieval' as const,
        packet: createValidPacket(),
      };
      const mockRecord = createMockRecord();

      let capturedValues: any;
      mockTenantDb.insert.mockReturnValue({
        values: vi.fn().mockImplementation((vals) => {
          capturedValues = vals;
          return {
            returning: vi.fn().mockResolvedValue([mockRecord]),
          };
        }),
      });

      await service.createEvidenceRecord(TENANT_ID, EXECUTION_ID, dto);

      expect(capturedValues.parentEvidenceId).toBeNull();
    });

    it('should pass parentEvidenceId when provided', async () => {
      const dto = {
        stepId: STEP_ID,
        sourceType: 'rag_retrieval' as const,
        packet: createValidPacket(),
        parentEvidenceId: PARENT_EVIDENCE_ID,
      };
      const mockRecord = createMockRecord({
        parentEvidenceId: PARENT_EVIDENCE_ID,
      });

      let capturedValues: any;
      mockTenantDb.insert.mockReturnValue({
        values: vi.fn().mockImplementation((vals) => {
          capturedValues = vals;
          return {
            returning: vi.fn().mockResolvedValue([mockRecord]),
          };
        }),
      });

      await service.createEvidenceRecord(TENANT_ID, EXECUTION_ID, dto);

      expect(capturedValues.parentEvidenceId).toBe(PARENT_EVIDENCE_ID);
    });

    it('should compute deterministic SHA-256 content hash', async () => {
      const packet = createValidPacket();
      const dto = {
        stepId: STEP_ID,
        sourceType: 'rag_retrieval' as const,
        packet,
      };

      let capturedValues: any;
      mockTenantDb.insert.mockReturnValue({
        values: vi.fn().mockImplementation((vals) => {
          capturedValues = vals;
          return {
            returning: vi.fn().mockResolvedValue([createMockRecord()]),
          };
        }),
      });

      await service.createEvidenceRecord(TENANT_ID, EXECUTION_ID, dto);

      expect(capturedValues.contentHash).toHaveLength(64);
      expect(capturedValues.contentHash).toMatch(/^[a-f0-9]{64}$/);

      const expectedHash = computeExpectedHash(
        EvidencePacketSchema.parse(packet),
      );
      expect(capturedValues.contentHash).toBe(expectedHash);
    });
  });

  describe('createBatchEvidenceRecords', () => {
    it('should buffer and flush batch records after delay', async () => {
      vi.useFakeTimers();

      const packet = createValidPacket();
      const dtos = [
        { stepId: STEP_ID, sourceType: 'rag_retrieval' as const, packet },
        { stepId: STEP_ID, sourceType: 'agent_decision' as const, packet },
      ];
      const mockRecords = [
        createMockRecord({ id: 'rec-1' }),
        createMockRecord({ id: 'rec-2' }),
      ];
      setupInsertReturning(mockRecords);

      const resultPromise = service.createBatchEvidenceRecords(
        TENANT_ID,
        EXECUTION_ID,
        dtos,
      );

      expect(mockTenantDb.insert).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);

      const result = await resultPromise;

      expect(result).toEqual(mockRecords);
      expect(mockTenantDb.insert).toHaveBeenCalledTimes(1);
    });

    it('should reject all entries when insert fails', async () => {
      vi.useFakeTimers();

      const packet = createValidPacket();
      const dtos = [
        { stepId: STEP_ID, sourceType: 'rag_retrieval' as const, packet },
      ];
      const insertError = new Error('DB connection failed');
      mockTenantDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(insertError),
        }),
      });

      const resultPromise = service.createBatchEvidenceRecords(
        TENANT_ID,
        EXECUTION_ID,
        dtos,
      );

      const expectation = expect(resultPromise).rejects.toThrow(
        'DB connection failed',
      );

      await vi.advanceTimersByTimeAsync(50);

      await expectation;
    });
  });

  describe('findByExecution', () => {
    it('should return paginated evidence records', async () => {
      const mockRecords = [
        createMockRecord({ id: 'rec-1' }),
        createMockRecord({ id: 'rec-2' }),
      ];
      setupSelectPaginated(mockRecords, 2);

      const result = await service.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toEqual(mockRecords);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('should filter by stepId when provided', async () => {
      setupSelectPaginated([], 0);

      await service.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 1,
        limit: 20,
        stepId: STEP_ID,
      });

      expect(mockTenantDb.select).toHaveBeenCalledTimes(2);
    });

    it('should calculate pagination metadata correctly', async () => {
      setupSelectPaginated([createMockRecord()], 45);

      const result = await service.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 2,
        limit: 10,
      });

      expect(result.meta).toEqual({
        page: 2,
        pageSize: 10,
        total: 45,
        totalPages: 5,
      });
    });

    it('should return empty results when no records exist', async () => {
      setupSelectPaginated([], 0);

      const result = await service.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('findById', () => {
    it('should return record when found', async () => {
      const mockRecord = createMockRecord();
      setupSelectWhere([mockRecord]);

      const result = await service.findById(TENANT_ID, EVIDENCE_ID);

      expect(result).toEqual(mockRecord);
    });

    it('should throw EvidenceNotFoundException when record not found', async () => {
      setupSelectWhere([]);

      await expect(
        service.findById(TENANT_ID, EVIDENCE_ID),
      ).rejects.toThrow(EvidenceNotFoundException);
    });
  });

  describe('verifyContentHash', () => {
    it('should return valid when hash matches', async () => {
      const packet = createValidPacket();
      const validatedPacket = EvidencePacketSchema.parse(packet);
      const correctHash = computeExpectedHash(validatedPacket);
      const mockRecord = createMockRecord({
        packet: validatedPacket,
        contentHash: correctHash,
      });
      setupSelectWhere([mockRecord]);

      const result = await service.verifyContentHash(TENANT_ID, EVIDENCE_ID);

      expect(result).toEqual({ valid: true, evidenceId: EVIDENCE_ID });
    });

    it('should throw EvidenceIntegrityException when hash does not match', async () => {
      const mockRecord = createMockRecord({
        contentHash: 'b'.repeat(64),
      });
      setupSelectWhere([mockRecord]);

      await expect(
        service.verifyContentHash(TENANT_ID, EVIDENCE_ID),
      ).rejects.toThrow(EvidenceIntegrityException);
    });
  });

  describe('event handlers', () => {
    it('handleEvidenceCreate should delegate to createEvidenceRecord', async () => {
      const dto = {
        stepId: STEP_ID,
        sourceType: 'rag_retrieval' as const,
        packet: createValidPacket(),
      };
      const mockRecord = createMockRecord();
      setupInsertReturning([mockRecord]);

      await service.handleEvidenceCreate({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        dto,
      });

      expect(mockTenantDb.insert).toHaveBeenCalledTimes(1);
    });

    it('handleEvidenceBatchCreate should delegate to createBatchEvidenceRecords', async () => {
      vi.useFakeTimers();

      const packet = createValidPacket();
      const dtos = [
        { stepId: STEP_ID, sourceType: 'rag_retrieval' as const, packet },
      ];
      setupInsertReturning([createMockRecord()]);

      const promise = service.handleEvidenceBatchCreate({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        dtos,
      });

      await vi.advanceTimersByTimeAsync(50);
      await promise;

      expect(mockTenantDb.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('DTO validation', () => {
    describe('EvidencePacketSchema', () => {
      it('should validate a well-formed evidence packet', () => {
        const packet = createValidPacket();
        const result = EvidencePacketSchema.safeParse(packet);

        expect(result.success).toBe(true);
      });

      it('should reject packet with missing required fields', () => {
        const packet = {
          evidenceId: EVIDENCE_ID,
        };
        const result = EvidencePacketSchema.safeParse(packet);

        expect(result.success).toBe(false);
      });

      it('should reject packet with invalid sourceType', () => {
        const packet = createValidPacket({
          sourceType: 'invalid_type',
        });
        const result = EvidencePacketSchema.safeParse(packet);

        expect(result.success).toBe(false);
      });

      it('should reject packet with relevanceScore out of range', () => {
        const packet = createValidPacket({
          semanticLocation: {
            context: 'test',
            relevanceScore: 1.5,
          },
        });
        const result = EvidencePacketSchema.safeParse(packet);

        expect(result.success).toBe(false);
      });

      it('should accept packet without optional fields', () => {
        const packet = {
          evidenceId: EVIDENCE_ID,
          sourceType: 'rag_retrieval',
          contentHash: 'a'.repeat(64),
          timestamp: '2025-01-01T00:00:00.000Z',
        };
        const result = EvidencePacketSchema.safeParse(packet);

        expect(result.success).toBe(true);
      });

      it('should reject contentHash with wrong length', () => {
        const packet = createValidPacket({
          contentHash: 'tooshort',
        });
        const result = EvidencePacketSchema.safeParse(packet);

        expect(result.success).toBe(false);
      });
    });

    describe('QueryEvidenceSchema', () => {
      it('should apply default values for page and limit', () => {
        const result = QueryEvidenceSchema.parse({});

        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
      });

      it('should accept valid query params', () => {
        const result = QueryEvidenceSchema.parse({
          page: '3',
          limit: '50',
          stepId: STEP_ID,
        });

        expect(result.page).toBe(3);
        expect(result.limit).toBe(50);
        expect(result.stepId).toBe(STEP_ID);
      });

      it('should reject limit exceeding 100', () => {
        const result = QueryEvidenceSchema.safeParse({
          limit: '101',
        });

        expect(result.success).toBe(false);
      });
    });
  });
});
