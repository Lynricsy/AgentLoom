import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { DRIZZLE } from '../../../database/database.module';
import {
  EvidencePacketSchema,
  QueryEvidenceChainSchema,
  QueryEvidenceSchema,
  type EvidencePacketDto,
  type EvidencePacketSummary,
} from '../dto/evidence.dto';
import {
  EvidenceNotFoundException,
  InvalidEvidencePacketException,
} from '../evidence.exceptions';
import { LlmEncryptionService } from '../../llm/llm-encryption.service';
import { EvidenceService } from '../evidence.service';

const mocks = vi.hoisted(() => ({
  tenantDb: {
    insert: vi.fn(),
    select: vi.fn(),
    execute: vi.fn(),
  },
  getTenantDb: vi.fn(),
  runInTenantTransaction: vi.fn(),
  uuidv7: vi.fn(),
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    delByPattern: vi.fn(),
  },
  llmEncryptionService: {
    isE2EEEnabled: vi.fn().mockResolvedValue(false),
    encryptForTenant: vi.fn(),
  },
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: mocks.runInTenantTransaction,
}));

vi.mock('uuid', () => ({
  v7: mocks.uuidv7,
}));

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const EXECUTION_ID = '00000000-0000-4000-8000-000000000002';
const STEP_ID = '00000000-0000-4000-8000-000000000003';
const NODE_ID = 'node-evidence';
const EXISTING_PARENT_ID = '00000000-0000-7000-8000-000000000010';
const GENERATED_ID_1 = '00000000-0000-7000-8000-000000000101';
const GENERATED_ID_2 = '00000000-0000-7000-8000-000000000102';
const GENERATED_ID_3 = '00000000-0000-7000-8000-000000000103';
const NOW = '2026-03-10T10:00:00.000Z';

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((acc, [key, entryValue]) => {
        acc[key] = normalizeForHash(entryValue);
        return acc;
      }, {});
  }

  return value;
}

function extractHashSource(
  packet: Record<string, unknown>,
): Record<string, unknown> {
  if ('encryptedPacket' in packet) {
    return {
      sourceType: packet.sourceType,
      encryptedPacket: packet.encryptedPacket,
      summary: packet.summary,
    };
  }

  switch (packet.sourceType) {
    case 'rag_retrieval':
      return {
        sourceType: packet.sourceType,
        physicalLocation: packet.physicalLocation,
        semanticLocation: packet.semanticLocation,
        retrievedContent: packet.retrievedContent,
      };
    case 'agent_decision':
      return {
        sourceType: packet.sourceType,
        agentDecision: packet.agentDecision,
      };
    case 'tool_output':
      return {
        sourceType: packet.sourceType,
        toolOutput: packet.toolOutput,
      };
    case 'user_input':
      return {
        sourceType: packet.sourceType,
        userInput: packet.userInput,
      };
    case 'intervention':
      return {
        sourceType: packet.sourceType,
        intervention: packet.intervention,
      };
    default:
      throw new Error(`Unsupported sourceType: ${String(packet.sourceType)}`);
  }
}

function computeExpectedHash(packet: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(normalizeForHash(extractHashSource(packet))))
    .digest('hex');
}

function createRagPacketInput(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: 'rag_retrieval' as const,
    physicalLocation: {
      documentId: 'doc-1',
      fileName: 'knowledge.md',
      page: 1,
      offset: 12,
      length: 42,
      chunkId: 'chunk-1',
    },
    semanticLocation: {
      sectionTitle: 'Overview',
      context: 'Chunk context',
      relevanceScore: 0.92,
    },
    retrievedContent: 'Retrieved chunk content',
    ...overrides,
  };
}

function createStepRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: STEP_ID,
    executionId: EXECUTION_ID,
    nodeId: NODE_ID,
    nodeData: {
      agentName: 'WriterAgent',
      autonomyMode: 'llm_suggest',
    },
    checkpointData: {},
    ...overrides,
  };
}

function createNodeErrorPacket(
  overrides: {
    errorType?: string;
    errorTitle?: string;
    errorMessage?: string;
    errorDetail?: string;
    nodeId?: string;
    stack?: string;
    typeMismatch?: {
      sourcePortId: string;
      targetPortId: string;
      sourceType: string;
      targetType: string;
      sourceNodeId: string;
      targetNodeId: string;
      edgeId?: string;
    };
  } = {},
): EvidencePacketDto {
  return EvidencePacketSchema.parse({
    sourceType: 'node_error',
    nodeError: {
      nodeId: overrides.nodeId ?? NODE_ID,
      errorMessage: overrides.errorMessage ?? '节点执行失败',
      ...(overrides.errorType ? { errorType: overrides.errorType } : {}),
      ...(overrides.errorTitle ? { errorTitle: overrides.errorTitle } : {}),
      ...(overrides.errorDetail ? { errorDetail: overrides.errorDetail } : {}),
      ...(overrides.stack ? { stack: overrides.stack } : {}),
      ...(overrides.typeMismatch
        ? { typeMismatch: overrides.typeMismatch }
        : {}),
    },
    evidenceId: GENERATED_ID_1,
    contentHash: 'd'.repeat(64),
    timestamp: NOW,
  });
}

function createSelectChain<T>(
  terminal: 'where' | 'limit' | 'offset',
  result: T,
) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);

  if (terminal === 'where') {
    chain.where.mockResolvedValue(result);
  } else {
    chain.where.mockReturnValue(chain);
  }

  if (terminal === 'limit') {
    chain.limit.mockResolvedValue(result);
  } else {
    chain.limit.mockReturnValue(chain);
  }

  if (terminal === 'offset') {
    chain.offset.mockResolvedValue(result);
  } else {
    chain.offset.mockReturnValue(chain);
  }

  return chain;
}

function queueSelectResult<T>(
  terminal: 'where' | 'limit' | 'offset',
  result: T,
) {
  const chain = createSelectChain(terminal, result);
  mocks.tenantDb.select.mockReturnValueOnce(chain);
  return chain;
}

function setupInsertReturning() {
  let capturedValues: Array<Record<string, unknown>> = [];
  const returning = vi.fn().mockImplementation(() =>
    Promise.resolve(
      capturedValues.map((value) => ({
        ...value,
        createdAt: NOW,
      })),
    ),
  );
  const values = vi
    .fn()
    .mockImplementation((received: Array<Record<string, unknown>>) => {
      capturedValues = received;
      return { returning };
    });

  mocks.tenantDb.insert.mockReturnValue({ values });

  return {
    values,
    returning,
    getCapturedValues: () => capturedValues,
  };
}

describe('EvidenceService', () => {
  let service: EvidenceService;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    mocks.tenantDb.insert.mockReset();
    mocks.tenantDb.select.mockReset();
    mocks.tenantDb.execute.mockReset();
    mocks.getTenantDb.mockReset();
    mocks.runInTenantTransaction.mockReset();
    mocks.uuidv7.mockReset();
    mocks.cacheService.get.mockReset();
    mocks.cacheService.set.mockReset();
    mocks.cacheService.del.mockReset();
    mocks.cacheService.delByPattern.mockReset();

    mocks.getTenantDb.mockReturnValue(mocks.tenantDb);
    mocks.runInTenantTransaction.mockImplementation(
      async (
        _db: unknown,
        _tenantId: string,
        operation: (dbClient: unknown) => Promise<unknown>,
      ) => operation(mocks.tenantDb),
    );

    mocks.llmEncryptionService.isE2EEEnabled
      .mockReset()
      .mockResolvedValue(false);
    mocks.llmEncryptionService.encryptForTenant.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceService,
        { provide: DRIZZLE, useValue: {} },
        { provide: RedisCacheService, useValue: mocks.cacheService },
        { provide: LlmEncryptionService, useValue: mocks.llmEncryptionService },
      ],
    }).compile();

    service = module.get(EvidenceService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('createEvidenceRecord', () => {
    it('should generate evidence metadata and persist aligned content hashes', async () => {
      mocks.uuidv7.mockReturnValue(GENERATED_ID_1);
      const insertMock = setupInsertReturning();

      const dto = {
        stepId: STEP_ID,
        sourceType: 'rag_retrieval' as const,
        packet: createRagPacketInput(),
      };

      const record = await service.createEvidenceRecord(
        TENANT_ID,
        EXECUTION_ID,
        dto,
      );

      const [inserted] = insertMock.getCapturedValues();

      expect(runInTenantTransaction).toHaveBeenCalledWith(
        {},
        TENANT_ID,
        expect.any(Function),
      );
      expect(inserted.id).toBe(GENERATED_ID_1);
      expect(inserted.parentEvidenceId).toBeNull();
      expect((inserted.packet as Record<string, unknown>).evidenceId).toBe(
        GENERATED_ID_1,
      );
      expect((inserted.packet as Record<string, unknown>).timestamp).toBe(NOW);
      expect((inserted.packet as Record<string, unknown>).contentHash).toBe(
        inserted.contentHash,
      );
      expect(inserted.contentHash).toBe(
        computeExpectedHash(inserted.packet as Record<string, unknown>),
      );
      expect(record.id).toBe(GENERATED_ID_1);
    });

    it('should keep the provided parentEvidenceId in both row and packet', async () => {
      mocks.uuidv7.mockReturnValue(GENERATED_ID_1);
      const insertMock = setupInsertReturning();

      await service.createEvidenceRecord(TENANT_ID, EXECUTION_ID, {
        stepId: STEP_ID,
        sourceType: 'rag_retrieval',
        parentEvidenceId: EXISTING_PARENT_ID,
        packet: createRagPacketInput({ parentEvidenceId: EXISTING_PARENT_ID }),
      });

      const [inserted] = insertMock.getCapturedValues();
      expect(inserted.parentEvidenceId).toBe(EXISTING_PARENT_ID);
      expect(
        (inserted.packet as Record<string, unknown>).parentEvidenceId,
      ).toBe(EXISTING_PARENT_ID);
    });

    it('should reject mismatched packet sourceType', async () => {
      await expect(
        service.createEvidenceRecord(TENANT_ID, EXECUTION_ID, {
          stepId: STEP_ID,
          sourceType: 'agent_decision',
          packet: createRagPacketInput(),
        }),
      ).rejects.toBeInstanceOf(InvalidEvidencePacketException);
    });
  });

  describe('createBatchEvidenceRecords', () => {
    it('should buffer records and flush them after 50ms', async () => {
      mocks.uuidv7
        .mockReturnValueOnce(GENERATED_ID_1)
        .mockReturnValueOnce(GENERATED_ID_2);
      const insertMock = setupInsertReturning();

      const promise = service.createBatchEvidenceRecords(
        TENANT_ID,
        EXECUTION_ID,
        [
          {
            stepId: STEP_ID,
            sourceType: 'rag_retrieval',
            packet: createRagPacketInput(),
          },
          {
            stepId: STEP_ID,
            sourceType: 'tool_output',
            packet: {
              sourceType: 'tool_output',
              toolOutput: {
                toolName: 'search',
                toolInput: { query: 'hello' },
                toolOutput: { text: 'world' },
              },
            },
          },
        ],
      );

      expect(mocks.tenantDb.insert).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);
      const records = await promise;

      expect(mocks.tenantDb.insert).toHaveBeenCalledOnce();
      expect(insertMock.getCapturedValues()).toHaveLength(2);
      expect(records).toHaveLength(2);
    });
  });

  describe('read operations', () => {
    it('should return paginated evidence by execution', async () => {
      const record = {
        id: GENERATED_ID_1,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        sourceType: 'rag_retrieval',
        packet: {
          ...createRagPacketInput(),
          evidenceId: GENERATED_ID_1,
          contentHash: 'a'.repeat(64),
          timestamp: NOW,
        },
        contentHash: 'a'.repeat(64),
        parentEvidenceId: null,
        isEncrypted: false,
        encryptionMetadata: null,
        createdAt: NOW,
      };
      queueSelectResult('offset', [record]);
      queueSelectResult('where', [{ total: 1 }]);

      const result = await service.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 1,
        limit: 20,
      });

      expect(getTenantDb).toHaveBeenCalled();
      expect(result).toEqual({
        data: [record],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('should enrich rag physicalLocation with chunkContent when includeChunkContent is true', async () => {
      const record = {
        id: GENERATED_ID_1,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        sourceType: 'rag_retrieval',
        packet: {
          ...createRagPacketInput(),
          evidenceId: GENERATED_ID_1,
          contentHash: 'a'.repeat(64),
          timestamp: NOW,
        },
        contentHash: 'a'.repeat(64),
        parentEvidenceId: null,
        createdAt: NOW,
      };

      queueSelectResult('offset', [record]);
      queueSelectResult('where', [{ total: 1 }]);
      queueSelectResult('where', [
        {
          id: 'chunk-1',
          content: 'Chunk content from DB',
        },
      ]);

      const result = await service.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 1,
        limit: 20,
        includeChunkContent: true,
      });

      const firstRecord = result.data[0];

      expect(mocks.tenantDb.select).toHaveBeenCalledTimes(3);
      expect(firstRecord).toBeDefined();
      expect(firstRecord?.packet.sourceType).toBe('rag_retrieval');
      if (!firstRecord || firstRecord.packet.sourceType !== 'rag_retrieval') {
        throw new Error('Expected rag evidence record');
      }
      expect(firstRecord.packet.physicalLocation).toMatchObject({
        chunkId: 'chunk-1',
        chunkContent: 'Chunk content from DB',
      });
    });

    it('should filter evidence by sourceType', async () => {
      const record = {
        id: GENERATED_ID_1,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        sourceType: 'agent_decision',
        packet: {
          ...createRagPacketInput(),
          evidenceId: GENERATED_ID_1,
          contentHash: 'a'.repeat(64),
          timestamp: NOW,
        },
        contentHash: 'a'.repeat(64),
        parentEvidenceId: null,
        isEncrypted: false,
        encryptionMetadata: null,
        createdAt: NOW,
      };
      queueSelectResult('offset', [record]);
      queueSelectResult('where', [{ total: 1 }]);

      const result = await service.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 1,
        limit: 20,
        sourceType: 'agent_decision',
      });

      expect(result.data).toEqual([record]);
      expect(result.meta.total).toBe(1);
    });

    it('should filter evidence by nodeId via execution_steps lookup', async () => {
      const record = {
        id: GENERATED_ID_1,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        sourceType: 'rag_retrieval',
        packet: {
          ...createRagPacketInput(),
          evidenceId: GENERATED_ID_1,
          contentHash: 'a'.repeat(64),
          timestamp: NOW,
        },
        contentHash: 'a'.repeat(64),
        parentEvidenceId: null,
        isEncrypted: false,
        encryptionMetadata: null,
        createdAt: NOW,
      };
      // First select: step IDs matching nodeId
      queueSelectResult('where', [{ id: STEP_ID }]);
      // Second select: evidence data
      queueSelectResult('offset', [record]);
      // Third select: evidence count
      queueSelectResult('where', [{ total: 1 }]);

      const result = await service.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 1,
        limit: 20,
        nodeId: NODE_ID,
      });

      expect(result.data).toEqual([record]);
      expect(result.meta.total).toBe(1);
    });

    it('should return empty result when nodeId matches no steps', async () => {
      // Step lookup returns empty
      queueSelectResult('where', []);

      const result = await service.findByExecution(TENANT_ID, EXECUTION_ID, {
        page: 1,
        limit: 20,
        nodeId: 'nonexistent-node',
      });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('should scope findById by executionId', async () => {
      const record = {
        id: GENERATED_ID_1,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        sourceType: 'rag_retrieval',
        packet: {
          ...createRagPacketInput(),
          evidenceId: GENERATED_ID_1,
          contentHash: 'b'.repeat(64),
          timestamp: NOW,
        },
        contentHash: 'b'.repeat(64),
        parentEvidenceId: null,
        isEncrypted: false,
        encryptionMetadata: null,
        createdAt: NOW,
      };
      queueSelectResult('limit', [record]);

      await expect(
        service.findById(TENANT_ID, EXECUTION_ID, GENERATED_ID_1),
      ).resolves.toEqual(record);
    });

    it('should throw EvidenceNotFoundException when scoped record is missing', async () => {
      queueSelectResult('limit', []);

      await expect(
        service.findById(TENANT_ID, EXECUTION_ID, GENERATED_ID_1),
      ).rejects.toBeInstanceOf(EvidenceNotFoundException);
    });
  });

  describe('verifyContentHash', () => {
    it('should return valid=false with integrityWarning=true on mismatch', async () => {
      const packet = {
        ...createRagPacketInput(),
        evidenceId: GENERATED_ID_1,
        contentHash: 'c'.repeat(64),
        timestamp: NOW,
      };
      queueSelectResult('limit', [
        {
          id: GENERATED_ID_1,
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          tenantId: TENANT_ID,
          sourceType: 'rag_retrieval',
          packet,
          contentHash: 'f'.repeat(64),
          parentEvidenceId: null,
          createdAt: NOW,
        },
      ]);

      await expect(
        service.verifyContentHash(TENANT_ID, EXECUTION_ID, GENERATED_ID_1),
      ).resolves.toEqual({
        evidenceId: GENERATED_ID_1,
        valid: false,
        integrityWarning: true,
        currentHash: computeExpectedHash(packet),
      });
    });

    it('should return valid=true when recomputed hash matches stored content hash', async () => {
      const packet = {
        ...createRagPacketInput(),
        evidenceId: GENERATED_ID_1,
        timestamp: NOW,
        contentHash: '',
      };
      const contentHash = computeExpectedHash(packet);
      packet.contentHash = contentHash;

      queueSelectResult('limit', [
        {
          id: GENERATED_ID_1,
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          tenantId: TENANT_ID,
          sourceType: 'rag_retrieval',
          packet,
          contentHash,
          parentEvidenceId: null,
          createdAt: NOW,
        },
      ]);

      await expect(
        service.verifyContentHash(TENANT_ID, EXECUTION_ID, GENERATED_ID_1),
      ).resolves.toEqual({
        evidenceId: GENERATED_ID_1,
        valid: true,
        integrityWarning: false,
        currentHash: contentHash,
      });
    });

    it('should accept legacy encrypted evidence rows that still store ciphertext-only hash', async () => {
      const encryptedPayload = {
        ciphertext: 'legacy-ciphertext',
        encryptedSessionKey: 'legacy-session-key',
        iv: 'legacy-iv',
        authTag: 'legacy-auth-tag',
        aad: `${TENANT_ID}:${NOW}`,
        keyFingerprint: 'legacy-fingerprint',
        algorithm: 'RSA-OAEP-4096+AES-256-GCM',
      };
      const legacyHash = createHash('sha256')
        .update(encryptedPayload.ciphertext)
        .digest('hex');

      queueSelectResult('limit', [
        {
          id: GENERATED_ID_1,
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          tenantId: TENANT_ID,
          sourceType: 'agent_decision',
          packet: {
            sourceType: 'agent_decision',
            agentDecision: {
              nodeId: NODE_ID,
              agentName: 'WriterAgent',
              autonomyMode: 'llm_suggest',
              selectedAction: 'approve',
              alternatives: ['approve'],
              confidence: 0.95,
              reasoning: 'Auto-approved',
            },
            evidenceId: GENERATED_ID_1,
            timestamp: NOW,
            contentHash: 'plain-hash-should-be-hidden'.padEnd(64, '0'),
          },
          contentHash: legacyHash,
          parentEvidenceId: null,
          isEncrypted: true,
          encryptionMetadata: {
            isEncrypted: true,
            keyFingerprint: encryptedPayload.keyFingerprint,
            algorithm: encryptedPayload.algorithm,
            encryptedAt: NOW,
            encryptedPayload,
          },
          createdAt: NOW,
        },
      ]);

      await expect(
        service.verifyContentHash(TENANT_ID, EXECUTION_ID, GENERATED_ID_1),
      ).resolves.toEqual({
        evidenceId: GENERATED_ID_1,
        valid: true,
        integrityWarning: false,
        currentHash: expect.any(String),
      });
    });
  });

  describe('automatic evidence handlers', () => {
    it('should create chained RAG evidence records from retrieval results', async () => {
      mocks.uuidv7
        .mockReturnValueOnce(GENERATED_ID_1)
        .mockReturnValueOnce(GENERATED_ID_2);
      const insertMock = setupInsertReturning();
      queueSelectResult('limit', [createStepRecord()]);
      queueSelectResult('limit', [{ id: EXISTING_PARENT_ID }]);

      await service.handleRagRetrieved({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        results: [
          {
            chunkId: 'chunk-1',
            score: 0.91,
            content: 'First chunk',
            location: { page: 1, fileName: 'kb.md', offset: 3 },
            documentId: 'doc-1',
            knowledgeBaseId: 'kb-1',
            chunkIndex: 0,
          },
          {
            chunkId: 'chunk-2',
            score: 0.88,
            content: 'Second chunk',
            location: { page: 2, fileName: 'kb.md', offset: 40 },
            documentId: 'doc-1',
            knowledgeBaseId: 'kb-1',
            chunkIndex: 1,
          },
        ],
      });

      const [first, second] = insertMock.getCapturedValues();
      expect(first.parentEvidenceId).toBe(EXISTING_PARENT_ID);
      expect(second.parentEvidenceId).toBe(GENERATED_ID_1);
      expect((first.packet as Record<string, unknown>).sourceType).toBe(
        'rag_retrieval',
      );
      expect((second.packet as Record<string, unknown>).retrievedContent).toBe(
        'Second chunk',
      );
    });

    it('should create decision evidence from step agent events', async () => {
      mocks.uuidv7.mockReturnValue(GENERATED_ID_1);
      const insertMock = setupInsertReturning();
      queueSelectResult('limit', [createStepRecord()]);
      queueSelectResult('limit', [{ id: EXISTING_PARENT_ID }]);

      await service.handleStepAgentEvent({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        event: {
          type: 'decision',
          suggestedContent: 'Suggested content',
          autonomyMode: 'llm_suggest',
          selectedAction: 'request_intervention',
          alternatives: ['approve', 'modify', 'reject'],
          confidence: 0.87,
          rationale: 'Need human review',
        },
      });

      const [inserted] = insertMock.getCapturedValues();
      expect(
        (inserted.packet as Record<string, unknown>).agentDecision,
      ).toEqual(
        expect.objectContaining({
          nodeId: NODE_ID,
          agentName: 'WriterAgent',
          autonomyMode: 'llm_suggest',
          selectedAction: 'request_intervention',
          alternatives: ['approve', 'modify', 'reject'],
        }),
      );
    });

    it('should create tool evidence from terminal tool call status events', async () => {
      mocks.uuidv7.mockReturnValue(GENERATED_ID_1);
      const insertMock = setupInsertReturning();
      queueSelectResult('limit', [createStepRecord()]);
      queueSelectResult('limit', [{ id: EXISTING_PARENT_ID }]);

      await service.handleToolCallStatus({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: NODE_ID,
        toolCallId: 'toolu_bdrk_01D7Uy4PhXptSmrJ56XSCQcL',
        tool: 'web-search',
        status: 'completed',
        args: { query: 'evidence' },
        result: { value: 'done' },
        transitions: [
          {
            to: 'completed',
            source: 'worker',
            timestamp: NOW,
          },
        ],
      });

      const [inserted] = insertMock.getCapturedValues();
      expect((inserted.packet as Record<string, unknown>).toolOutput).toEqual(
        expect.objectContaining({
          toolName: 'web-search',
          toolCallId: 'toolu_bdrk_01D7Uy4PhXptSmrJ56XSCQcL',
          transitions: [
            {
              to: 'completed',
              source: 'worker',
              timestamp: NOW,
            },
          ],
        }),
      );
    });

    it('should create intervention evidence with requestedAt and modifiedContent', async () => {
      mocks.uuidv7.mockReturnValue(GENERATED_ID_3);
      const insertMock = setupInsertReturning();
      queueSelectResult('limit', [
        createStepRecord({
          checkpointData: {
            interventionRequestedAt: '2026-03-10T09:30:00.000Z',
          },
        }),
      ]);
      queueSelectResult('limit', [{ id: EXISTING_PARENT_ID }]);

      await service.handleInterventionResolved({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: NODE_ID,
        action: 'modify',
        feedback: 'Adjusted for clarity',
        modifiedContent: { content: 'Approved content' },
        resolvedBy: 'user-1',
        resolvedAt: NOW,
      });

      const [inserted] = insertMock.getCapturedValues();
      expect((inserted.packet as Record<string, unknown>).intervention).toEqual(
        expect.objectContaining({
          action: 'modify',
          feedback: 'Adjusted for clarity',
          modifiedContent: { content: 'Approved content' },
          requestedAt: '2026-03-10T09:30:00.000Z',
          resolvedAt: NOW,
          resolvedBy: 'user-1',
        }),
      );
    });

    it('should create node_error evidence from failed step events and chain parentEvidenceId', async () => {
      mocks.uuidv7.mockReturnValue(GENERATED_ID_1);
      const insertMock = setupInsertReturning();
      queueSelectResult('limit', [createStepRecord()]);
      queueSelectResult('limit', [{ id: EXISTING_PARENT_ID }]);

      await service.handleStepFailed({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: NODE_ID,
        from: 'running',
        to: 'failed',
        errorDetail: {
          message: '端口类型不兼容',
          type: 'https://agentloom.dev/errors/node-type-mismatch',
          title: '端口类型不匹配',
          detail: '上游输出与下游输入的数据类型不兼容',
          nodeId: NODE_ID,
          stack: 'Error: boom\n    at worker.ts:1:1',
          typeMismatch: {
            sourcePortId: 'output-text',
            targetPortId: 'input-image',
            sourceType: 'text',
            targetType: 'image',
            sourceNodeId: 'node-source',
            targetNodeId: 'node-target',
            edgeId: 'edge-1',
          },
        },
      });

      const [inserted] = insertMock.getCapturedValues();
      expect(inserted.sourceType).toBe('node_error');
      expect(inserted.parentEvidenceId).toBe(EXISTING_PARENT_ID);
      expect(
        (inserted.packet as Record<string, unknown>).parentEvidenceId,
      ).toBe(EXISTING_PARENT_ID);
      expect((inserted.packet as Record<string, unknown>).nodeError).toEqual({
        nodeId: NODE_ID,
        errorMessage: '端口类型不兼容',
        errorType: 'https://agentloom.dev/errors/node-type-mismatch',
        errorTitle: '端口类型不匹配',
        errorDetail: '上游输出与下游输入的数据类型不兼容',
        stack: 'Error: boom\n    at worker.ts:1:1',
        typeMismatch: {
          sourcePortId: 'output-text',
          targetPortId: 'input-image',
          sourceType: 'text',
          targetType: 'image',
          sourceNodeId: 'node-source',
          targetNodeId: 'node-target',
          edgeId: 'edge-1',
        },
      });
    });

    it('should warn and skip node_error evidence creation when step is missing', async () => {
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      queueSelectResult('limit', []);

      await service.handleStepFailed({
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        nodeId: NODE_ID,
        from: 'running',
        to: 'failed',
        errorDetail: {
          message: '节点失败',
        },
      });

      expect(warnSpy).toHaveBeenCalledWith(
        `Skip node error evidence creation because step ${STEP_ID} is unavailable for execution ${EXECUTION_ID}`,
      );
      expect(mocks.tenantDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('buildPacketSummary', () => {
    it('should build default node_error summary when errorType is absent', () => {
      const buildPacketSummary = (
        Reflect.get(service, 'buildPacketSummary') as (
          packet: EvidencePacketDto,
        ) => EvidencePacketSummary
      ).bind(service);

      const summary = buildPacketSummary(
        createNodeErrorPacket({
          errorMessage: '执行失败',
          errorTitle: '节点处理失败',
        }),
      );

      expect(summary).toEqual({
        title: '节点错误',
        excerpt: '节点处理失败',
        metadata: {
          nodeId: NODE_ID,
        },
      });
    });

    it('should include errorType and typeMismatch metadata for node_error summary', () => {
      const buildPacketSummary = (
        Reflect.get(service, 'buildPacketSummary') as (
          packet: EvidencePacketDto,
        ) => EvidencePacketSummary
      ).bind(service);

      const summary = buildPacketSummary(
        createNodeErrorPacket({
          errorType: 'TypeMismatch',
          errorMessage: '源输出与目标输入不兼容',
          typeMismatch: {
            sourcePortId: 'output-text',
            targetPortId: 'input-image',
            sourceType: 'string',
            targetType: 'image',
            sourceNodeId: 'node-source',
            targetNodeId: 'node-target',
          },
        }),
      );

      expect(summary).toEqual({
        title: '节点错误 · TypeMismatch',
        excerpt: '源输出与目标输入不兼容',
        metadata: {
          nodeId: NODE_ID,
          errorType: 'TypeMismatch',
          sourceType: 'string',
          targetType: 'image',
        },
      });
    });
  });

  describe('QueryEvidenceSchema', () => {
    it('should apply default pagination values', () => {
      expect(QueryEvidenceSchema.parse({})).toEqual({
        page: 1,
        limit: 20,
        includeChunkContent: false,
      });
    });
  });

  describe('QueryEvidenceChainSchema', () => {
    it('should accept plain-text workflow node ids', () => {
      expect(QueryEvidenceChainSchema.parse({ nodeId: 'node-abc' })).toEqual({
        nodeId: 'node-abc',
      });
    });
  });

  // ─── Chain helpers ───────────────────────────────────────

  const EVIDENCE_ID_A = '00000000-0000-7000-8000-aaaaaaaaaaaa';
  const EVIDENCE_ID_B = '00000000-0000-7000-8000-bbbbbbbbbbbb';
  const EVIDENCE_ID_C = '00000000-0000-7000-8000-cccccccccccc';
  const CHUNK_ID_1 = 'chunk-001';
  const CHUNK_ID_2 = 'chunk-002';

  function buildValidRagPacket(
    evidenceId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const packetOverrides = { ...overrides };
    const physicalLocationOverride = packetOverrides.physicalLocation as
      | Record<string, unknown>
      | undefined;

    delete packetOverrides.physicalLocation;

    const base = createRagPacketInput({
      physicalLocation: {
        documentId: 'doc-1',
        fileName: 'knowledge.md',
        page: 1,
        offset: 12,
        length: 42,
        chunkId:
          typeof packetOverrides.chunkId === 'string'
            ? packetOverrides.chunkId
            : CHUNK_ID_1,
        ...physicalLocationOverride,
      },
      ...packetOverrides,
    });
    const packet: Record<string, unknown> = {
      ...base,
      evidenceId,
      timestamp: NOW,
      contentHash: '',
      parentEvidenceId:
        (packetOverrides.parentEvidenceId as string) || undefined,
    };
    packet.contentHash = computeExpectedHash(packet);
    return packet;
  }

  function buildValidAgentPacket(
    evidenceId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const packet: Record<string, unknown> = {
      sourceType: 'agent_decision',
      agentDecision: {
        nodeId: NODE_ID,
        agentName: 'WriterAgent',
        autonomyMode: 'llm_suggest',
        selectedAction: 'approve',
        alternatives: ['approve'],
        confidence: 0.95,
        reasoning: 'Auto-approved',
        ...(overrides.agentDecision as Record<string, unknown> | undefined),
      },
      evidenceId,
      timestamp: NOW,
      contentHash: '',
      parentEvidenceId:
        (overrides.parentEvidenceId as string | undefined) ?? undefined,
    };
    packet.contentHash = computeExpectedHash(packet);
    return packet;
  }

  function makeCteRow(
    evidenceId: string,
    parentEvidenceId: string | null = null,
    extraPacketOverrides: Record<string, unknown> = {},
    extraRowOverrides: Record<string, unknown> = {},
  ) {
    const packet = buildValidRagPacket(evidenceId, {
      parentEvidenceId,
      ...extraPacketOverrides,
    });
    return {
      id: evidenceId,
      execution_id: EXECUTION_ID,
      step_id: STEP_ID,
      tenant_id: TENANT_ID,
      source_type: 'rag_retrieval',
      packet,
      content_hash: packet.contentHash,
      parent_evidence_id: parentEvidenceId,
      created_at: new Date(NOW),
      depth: 0,
      ...extraRowOverrides,
    };
  }

  function makeAgentRow(
    evidenceId: string,
    parentEvidenceId: string | null = null,
    overrides: Record<string, unknown> = {},
  ) {
    const packet = buildValidAgentPacket(evidenceId, {
      parentEvidenceId,
      ...overrides,
    });
    return {
      id: evidenceId,
      execution_id: EXECUTION_ID,
      step_id: STEP_ID,
      tenant_id: TENANT_ID,
      source_type: 'agent_decision',
      packet,
      content_hash: packet.contentHash,
      parent_evidence_id: parentEvidenceId,
      created_at: new Date(NOW),
      depth: 0,
    };
  }

  function mockCacheAndCte(
    rows: Record<string, unknown>[],
    chunks: Array<{ id: string; content: string }> = [],
  ) {
    mocks.cacheService.get.mockResolvedValue(null);
    mocks.cacheService.set.mockResolvedValue(undefined);
    mocks.tenantDb.execute.mockResolvedValue({ rows });

    const selectChain = createSelectChain('where', chunks);
    mocks.tenantDb.select.mockReturnValueOnce(selectChain);
  }

  describe('buildChain', () => {
    it('should return empty chain when no evidence records exist', async () => {
      mockCacheAndCte([]);

      const { response, cached } = await service.buildChain(
        TENANT_ID,
        EXECUTION_ID,
      );

      expect(cached).toBe(false);
      expect(response).toMatchObject({
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
      });
      expect(typeof response.cachedAt).toBe('string');
    });

    it('should build a single-root chain with packetSummary metadata', async () => {
      const row = makeCteRow(EVIDENCE_ID_A);
      mockCacheAndCte(
        [row],
        [{ id: CHUNK_ID_1, content: 'Retrieved chunk content' }],
      );

      const { response } = await service.buildChain(TENANT_ID, EXECUTION_ID);
      const node = response.roots[0];

      expect(response.roots).toHaveLength(1);
      expect(node.evidenceId).toBe(EVIDENCE_ID_A);
      expect(node.depth).toBe(0);
      expect(node.children).toEqual([]);
      expect(node.hashValid).toBe(true);
      expect(node.packetSummary.title).toBe('RAG 检索 · knowledge.md');
      expect(node.packetSummary.excerpt).toBe('Retrieved chunk content');
      expect(node.packetSummary.metadata?.documentId).toBe('doc-1');
      expect(node.packetSummary.metadata?.chunkId).toBe(CHUNK_ID_1);
    });

    it('should rebuild an ancestor-first tree when rows include upward lineage', async () => {
      const ancestor = makeCteRow(EVIDENCE_ID_A);
      const leaf = makeCteRow(EVIDENCE_ID_B, EVIDENCE_ID_A, {
        chunkId: CHUNK_ID_2,
      });
      mockCacheAndCte(
        [ancestor, leaf],
        [
          { id: CHUNK_ID_1, content: 'Retrieved chunk content' },
          { id: CHUNK_ID_2, content: 'Retrieved chunk content' },
        ],
      );

      const { response } = await service.buildChain(
        TENANT_ID,
        EXECUTION_ID,
        'node-abc',
      );

      expect(response.roots).toHaveLength(1);
      expect(response.roots[0].evidenceId).toBe(EVIDENCE_ID_A);
      expect(response.roots[0].depth).toBe(0);
      expect(response.roots[0].children[0]).toEqual(
        expect.objectContaining({
          evidenceId: EVIDENCE_ID_B,
          depth: 1,
        }),
      );
      expect(mocks.cacheService.get).toHaveBeenCalledWith(
        `evidence:chain:${EXECUTION_ID}:node-abc`,
      );
    });

    it('should keep shared ancestors wired under a single root', async () => {
      const root = makeCteRow(EVIDENCE_ID_A);
      const childA = makeCteRow(EVIDENCE_ID_B, EVIDENCE_ID_A, {
        chunkId: CHUNK_ID_1,
      });
      const childB = makeCteRow(EVIDENCE_ID_C, EVIDENCE_ID_A, {
        chunkId: CHUNK_ID_2,
      });
      mockCacheAndCte(
        [root, childA, childB],
        [
          { id: CHUNK_ID_1, content: 'Retrieved chunk content' },
          { id: CHUNK_ID_2, content: 'Retrieved chunk content' },
        ],
      );

      const { response } = await service.buildChain(
        TENANT_ID,
        EXECUTION_ID,
        'node-abc',
      );

      expect(response.roots).toHaveLength(1);
      expect(
        response.roots[0].children.map((child) => child.evidenceId),
      ).toEqual([EVIDENCE_ID_B, EVIDENCE_ID_C]);
      expect(response.totalNodes).toBe(3);
    });

    it('should compute completeness from physicalLocation ratio and below-threshold label', async () => {
      const ragRow = makeCteRow(EVIDENCE_ID_A);
      const agentRow = makeAgentRow(EVIDENCE_ID_B, EVIDENCE_ID_A);
      mockCacheAndCte(
        [ragRow, agentRow],
        [{ id: CHUNK_ID_1, content: 'Retrieved chunk content' }],
      );

      const { response } = await service.buildChain(TENANT_ID, EXECUTION_ID);

      expect(response.chainCompleteness).toBe(0.5);
      expect(response.integrityStatus).toEqual(
        expect.objectContaining({
          chainCompleteness: 0.5,
          totalNodes: 2,
          nodesWithPhysicalLocation: 1,
          completenessLabel: 'evidence_completeness: 0.50',
        }),
      );
    });

    it('should treat a 0.95 ratio as complete', async () => {
      const rows = Array.from({ length: 20 }, (_, index) => {
        const evidenceId = `00000000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`;
        if (index < 19) {
          return makeCteRow(evidenceId, null, {
            chunkId: `${CHUNK_ID_1}-${index}`,
          });
        }

        return makeAgentRow(evidenceId);
      });
      const chunks = Array.from({ length: 19 }, (_, index) => ({
        id: `${CHUNK_ID_1}-${index}`,
        content: 'Retrieved chunk content',
      }));
      mockCacheAndCte(rows, chunks);

      const { response } = await service.buildChain(TENANT_ID, EXECUTION_ID);

      expect(response.chainCompleteness).toBe(0.95);
      expect(response.integrityStatus.completenessLabel).toBe('complete');
    });

    it('should emit hash_mismatch issues without affecting completeness ratio', async () => {
      const row = makeCteRow(EVIDENCE_ID_A);
      (row as Record<string, unknown>).content_hash = 'f'.repeat(64);
      mockCacheAndCte(
        [row],
        [{ id: CHUNK_ID_1, content: 'Retrieved chunk content' }],
      );

      const { response } = await service.buildChain(TENANT_ID, EXECUTION_ID);

      expect(response.chainCompleteness).toBe(1);
      expect(response.integrityStatus.integrityIssues).toContainEqual({
        evidenceId: EVIDENCE_ID_A,
        issueType: 'hash_mismatch',
        description: '证据内容哈希校验失败',
      });
      expect(response.roots[0]?.hashValid).toBe(false);
    });
  });

  describe('source availability detection', () => {
    it('should mark sourceUnavailable when chunk has been deleted', async () => {
      const row = makeCteRow(EVIDENCE_ID_A);
      mockCacheAndCte([row], []);

      const { response } = await service.buildChain(TENANT_ID, EXECUTION_ID);

      expect(response.roots[0]).toEqual(
        expect.objectContaining({
          sourceUnavailable: true,
          unavailableReason: '来源不可用—原始文档已删除',
        }),
      );
      expect(response.integrityStatus.integrityIssues).toContainEqual({
        evidenceId: EVIDENCE_ID_A,
        issueType: 'source_unavailable',
        description: '来源不可用—原始文档已删除',
      });
    });

    it('should mark sourceModified and preserve originalSnapshot when chunk content changes', async () => {
      const row = makeCteRow(EVIDENCE_ID_A, null, {
        semanticLocation: {
          sectionTitle: 'Overview',
          context: 'Original semantic snapshot',
          relevanceScore: 0.92,
        },
      });
      mockCacheAndCte(
        [row],
        [{ id: CHUNK_ID_1, content: 'MODIFIED content that differs' }],
      );

      const { response } = await service.buildChain(TENANT_ID, EXECUTION_ID);

      expect(response.roots[0]).toEqual(
        expect.objectContaining({
          sourceModified: true,
          unavailableReason: '来源已修改—原始文档内容发生变化',
          originalSnapshot: 'Original semantic snapshot',
        }),
      );
      expect(response.integrityStatus.integrityIssues).toContainEqual({
        evidenceId: EVIDENCE_ID_A,
        issueType: 'source_modified',
        description: '来源已修改—原始文档内容发生变化',
      });
    });

    it('should batch chunk lookups for multiple rag nodes', async () => {
      const rowA = makeCteRow(EVIDENCE_ID_A, null, { chunkId: CHUNK_ID_1 });
      const rowB = makeCteRow(EVIDENCE_ID_B, EVIDENCE_ID_A, {
        chunkId: CHUNK_ID_2,
      });
      mockCacheAndCte(
        [rowA, rowB],
        [
          { id: CHUNK_ID_1, content: 'Retrieved chunk content' },
          { id: CHUNK_ID_2, content: 'Retrieved chunk content' },
        ],
      );

      const { response } = await service.buildChain(TENANT_ID, EXECUTION_ID);

      expect(response.roots[0]?.children[0]).not.toHaveProperty(
        'sourceUnavailable',
      );
      expect(response.roots[0]?.children[0]).not.toHaveProperty(
        'sourceModified',
      );
      expect(mocks.tenantDb.select).toHaveBeenCalledOnce();
    });
  });

  describe('chain Redis cache', () => {
    it('should return cached response on cache hit', async () => {
      const cachedResponse = {
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
        cachedAt: NOW,
      };
      mocks.cacheService.get.mockResolvedValue(JSON.stringify(cachedResponse));

      const { response, cached } = await service.buildChain(
        TENANT_ID,
        EXECUTION_ID,
      );

      expect(cached).toBe(true);
      expect(response).toEqual(cachedResponse);
      expect(mocks.tenantDb.execute).not.toHaveBeenCalled();
    });

    it('should compute and cache on cache miss', async () => {
      mockCacheAndCte([]);

      await service.buildChain(TENANT_ID, EXECUTION_ID);

      expect(mocks.cacheService.set).toHaveBeenCalledWith(
        `evidence:chain:${EXECUTION_ID}:all`,
        expect.any(String),
        300,
      );
    });

    it('should invalidate cache when evidence is inserted', async () => {
      mocks.uuidv7.mockReturnValue(GENERATED_ID_1);
      setupInsertReturning();

      await service.createEvidenceRecord(TENANT_ID, EXECUTION_ID, {
        stepId: STEP_ID,
        sourceType: 'rag_retrieval',
        packet: createRagPacketInput(),
      });

      expect(mocks.cacheService.delByPattern).toHaveBeenCalledWith(
        `evidence:chain:${EXECUTION_ID}:*`,
      );
    });

    it('should use plain-text workflow nodeId in cache key when provided', async () => {
      const row = makeCteRow(EVIDENCE_ID_A);
      mockCacheAndCte(
        [row],
        [{ id: CHUNK_ID_1, content: 'Retrieved chunk content' }],
      );

      await service.buildChain(TENANT_ID, EXECUTION_ID, 'node-abc');

      expect(mocks.cacheService.get).toHaveBeenCalledWith(
        `evidence:chain:${EXECUTION_ID}:node-abc`,
      );
      expect(mocks.cacheService.set).toHaveBeenCalledWith(
        `evidence:chain:${EXECUTION_ID}:node-abc`,
        expect.any(String),
        300,
      );
    });

    it('should degrade gracefully when cache read fails', async () => {
      mocks.cacheService.get.mockRejectedValue(new Error('Redis down'));
      mocks.cacheService.set.mockResolvedValue(undefined);
      mocks.tenantDb.execute.mockResolvedValue({ rows: [] });
      const selectChain = createSelectChain('where', []);
      mocks.tenantDb.select.mockReturnValueOnce(selectChain);

      const { response, cached } = await service.buildChain(
        TENANT_ID,
        EXECUTION_ID,
      );

      expect(cached).toBe(false);
      expect(response.roots).toEqual([]);
    });
  });

  describe('verifyChainIntegrity', () => {
    it('should bypass cached payloads and return a fresh live-source verification result', async () => {
      const cachedResponse = {
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
        cachedAt: NOW,
      };
      mocks.cacheService.get.mockResolvedValue(JSON.stringify(cachedResponse));

      const row = makeCteRow(EVIDENCE_ID_A);
      mocks.tenantDb.execute.mockResolvedValue({ rows: [row] });
      const selectChain = createSelectChain('where', [
        { id: CHUNK_ID_1, content: 'MODIFIED content that differs' },
      ]);
      mocks.tenantDb.select.mockReturnValueOnce(selectChain);

      const result = await service.verifyChainIntegrity(
        TENANT_ID,
        EXECUTION_ID,
      );

      expect(mocks.cacheService.get).not.toHaveBeenCalled();
      expect(mocks.cacheService.set).not.toHaveBeenCalled();
      expect(result.roots[0]).toEqual(
        expect.objectContaining({
          sourceModified: true,
          unavailableReason: '来源已修改—原始文档内容发生变化',
        }),
      );
      expect(result.integrityStatus.integrityIssues).toContainEqual({
        evidenceId: EVIDENCE_ID_A,
        issueType: 'source_modified',
        description: '来源已修改—原始文档内容发生变化',
      });
    });
  });
});
