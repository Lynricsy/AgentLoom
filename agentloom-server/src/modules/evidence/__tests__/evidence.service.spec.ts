import { createHash } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE } from '../../../database/database.module';
import { QueryEvidenceSchema } from '../dto/evidence.dto';
import {
  EvidenceNotFoundException,
  InvalidEvidencePacketException,
} from '../evidence.exceptions';
import { EvidenceService } from '../evidence.service';

const mocks = vi.hoisted(() => ({
  tenantDb: {
    insert: vi.fn(),
    select: vi.fn(),
  },
  getTenantDb: vi.fn(),
  runInTenantTransaction: vi.fn(),
  uuidv7: vi.fn(),
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

function extractHashSource(packet: Record<string, unknown>): Record<string, unknown> {
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
  const returning = vi.fn().mockImplementation(async () =>
    capturedValues.map((value) => ({
      ...value,
      createdAt: NOW,
    })),
  );
  const values = vi.fn().mockImplementation((received: Array<Record<string, unknown>>) => {
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
    mocks.getTenantDb.mockReset();
    mocks.runInTenantTransaction.mockReset();
    mocks.uuidv7.mockReset();

    mocks.getTenantDb.mockReturnValue(mocks.tenantDb);
    mocks.runInTenantTransaction.mockImplementation(
      async (_db: unknown, _tenantId: string, operation: (dbClient: unknown) => Promise<unknown>) =>
        operation(mocks.tenantDb),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [EvidenceService, { provide: DRIZZLE, useValue: {} }],
    }).compile();

    service = module.get(EvidenceService);
  });

  afterEach(() => {
    vi.useRealTimers();
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
      expect((inserted.packet as Record<string, unknown>).parentEvidenceId).toBe(
        EXISTING_PARENT_ID,
      );
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
      mocks.uuidv7.mockReturnValueOnce(GENERATED_ID_1).mockReturnValueOnce(GENERATED_ID_2);
      const insertMock = setupInsertReturning();

      const promise = service.createBatchEvidenceRecords(TENANT_ID, EXECUTION_ID, [
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
      ]);

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
      expect((inserted.packet as Record<string, unknown>).agentDecision).toEqual(
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
        toolCallId: '00000000-0000-4000-8000-000000000099',
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
          toolCallId: '00000000-0000-4000-8000-000000000099',
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
          checkpointData: { interventionRequestedAt: '2026-03-10T09:30:00.000Z' },
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
  });

  describe('QueryEvidenceSchema', () => {
    it('should apply default pagination values', () => {
      expect(QueryEvidenceSchema.parse({})).toEqual({
        page: 1,
        limit: 20,
      });
    });
  });
});
