import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { DRIZZLE } from '../../../database/database.module';
import {
  LlmEncryptionService,
  type EncryptedPayload,
} from '../../llm/llm-encryption.service';
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
    isE2EEEnabled: vi.fn(),
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
const ORG_ID = '00000000-0000-4000-8000-000000000004';
const GENERATED_ID_1 = '00000000-0000-7000-8000-000000000101';
const GENERATED_ID_2 = '00000000-0000-7000-8000-000000000102';
const NOW = '2026-03-15T18:00:00.000Z';

type CapturedInsertValue = {
  id: string;
  executionId: string;
  stepId: string;
  tenantId: string;
  sourceType: string;
  packet: Record<string, unknown>;
  contentHash: string;
  parentEvidenceId: string | null;
  isEncrypted?: boolean;
  encryptionMetadata?: Record<string, unknown>;
};

function createAgentDecisionPacketInput(
  overrides: Record<string, unknown> = {},
) {
  return {
    sourceType: 'agent_decision' as const,
    agentDecision: {
      nodeId: 'node-agent-1',
      agentName: 'WriterAgent',
      autonomyMode: 'FULL_AUTO',
      suggestedContent: '建议回复内容',
      reasoning: '因为上下文更完整',
      selectedAction: 'respond',
      confidence: 0.93,
    },
    ...overrides,
  };
}

function createToolOutputPacketInput(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: 'tool_output' as const,
    toolOutput: {
      toolName: 'search-docs',
      toolInput: { query: 'AgentLoom E2EE' },
      toolOutput: { text: 'Found encrypted evidence records' },
    },
    ...overrides,
  };
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

function queueOrgLookup(result: Array<{ id: string }> | []): void {
  mocks.tenantDb.select.mockReturnValueOnce(createSelectChain('limit', result));
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

function createEncryptedPayload(
  overrides: Partial<EncryptedPayload> = {},
): EncryptedPayload {
  return {
    ciphertext: 'ciphertext-base64',
    encryptedSessionKey: 'encrypted-session-key-base64',
    iv: 'iv-base64',
    authTag: 'auth-tag-base64',
    aad: `${TENANT_ID}:${NOW}`,
    keyFingerprint: 'fp-evidence-e2ee',
    algorithm: 'RSA-OAEP-4096+AES-256-GCM',
    ...overrides,
  };
}

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

function computeStoredPacketHash(packet: Record<string, unknown>): string {
  const hashSource =
    'encryptedPacket' in packet
      ? {
          sourceType: packet.sourceType,
          encryptedPacket: packet.encryptedPacket,
          summary: packet.summary,
        }
      : packet;

  return createHash('sha256')
    .update(JSON.stringify(normalizeForHash(hashSource)))
    .digest('hex');
}

describe('EvidenceService encryption integration', () => {
  let service: EvidenceService;

  beforeEach(async () => {
    vi.clearAllMocks();
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
    mocks.llmEncryptionService.isE2EEEnabled.mockReset();
    mocks.llmEncryptionService.encryptForTenant.mockReset();

    mocks.getTenantDb.mockReturnValue(mocks.tenantDb);
    mocks.runInTenantTransaction.mockImplementation(
      async (
        _db: unknown,
        _tenantId: string,
        operation: (dbClient: unknown) => Promise<unknown>,
      ) => operation(mocks.tenantDb),
    );
    mocks.cacheService.delByPattern.mockResolvedValue(undefined);
    mocks.llmEncryptionService.isE2EEEnabled.mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceService,
        { provide: DRIZZLE, useValue: {} },
        { provide: RedisCacheService, useValue: mocks.cacheService },
        {
          provide: LlmEncryptionService,
          useValue: mocks.llmEncryptionService,
        },
      ],
    }).compile();

    service = module.get(EvidenceService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    {
      label: 'agent_decision',
      sourceType: 'agent_decision' as const,
      packet: createAgentDecisionPacketInput(),
      generatedId: GENERATED_ID_1,
      ciphertext: 'agent-decision-ciphertext',
    },
    {
      label: 'tool_output',
      sourceType: 'tool_output' as const,
      packet: createToolOutputPacketInput(),
      generatedId: GENERATED_ID_2,
      ciphertext: 'tool-output-ciphertext',
    },
  ])(
    'E2EE 启用时会加密 $label 证据并基于密文更新 contentHash',
    async ({ sourceType, packet, generatedId, ciphertext }) => {
      mocks.uuidv7.mockReturnValue(generatedId);
      queueOrgLookup([{ id: ORG_ID }]);
      const insertMock = setupInsertReturning();
      const encryptedPayload = createEncryptedPayload({ ciphertext });

      mocks.llmEncryptionService.isE2EEEnabled.mockResolvedValue(true);
      mocks.llmEncryptionService.encryptForTenant.mockResolvedValue(
        encryptedPayload,
      );

      await service.createEvidenceRecord(TENANT_ID, EXECUTION_ID, {
        stepId: STEP_ID,
        sourceType,
        packet,
      });

      const [inserted] =
        insertMock.getCapturedValues() as CapturedInsertValue[];
      const encryptedPlaintext = mocks.llmEncryptionService.encryptForTenant
        .mock.calls[0]?.[2] as string;

      expect(mocks.llmEncryptionService.isE2EEEnabled).toHaveBeenCalledWith(
        TENANT_ID,
        ORG_ID,
      );
      const plaintextPacket = JSON.parse(encryptedPlaintext) as Record<
        string,
        unknown
      >;

      expect(plaintextPacket).toMatchObject({
        sourceType,
        evidenceId: generatedId,
        timestamp: NOW,
      });
      expect(inserted.packet).toMatchObject({
        sourceType,
        evidenceId: generatedId,
        timestamp: NOW,
        encryptedPacket: encryptedPayload,
      });
      expect(inserted.packet).toHaveProperty('summary.title');
      expect(inserted.isEncrypted).toBe(true);
      expect(inserted.encryptionMetadata).toEqual({
        isEncrypted: true,
        algorithm: encryptedPayload.algorithm,
        keyFingerprint: encryptedPayload.keyFingerprint,
        encryptedAt: NOW,
        plaintextHash: plaintextPacket.contentHash,
        contractVersion: 2,
      });
      expect(inserted.contentHash).toBe(inserted.packet.contentHash as string);
      expect(inserted.contentHash).toBe(
        computeStoredPacketHash(inserted.packet),
      );
    },
  );

  it('E2EE 启用时不会加密 rag_retrieval 证据', async () => {
    mocks.uuidv7.mockReturnValue(GENERATED_ID_1);
    const insertMock = setupInsertReturning();

    await service.createEvidenceRecord(TENANT_ID, EXECUTION_ID, {
      stepId: STEP_ID,
      sourceType: 'rag_retrieval',
      packet: createRagPacketInput(),
    });

    const [inserted] = insertMock.getCapturedValues() as CapturedInsertValue[];

    expect(mocks.tenantDb.select).not.toHaveBeenCalled();
    expect(mocks.llmEncryptionService.isE2EEEnabled).not.toHaveBeenCalled();
    expect(mocks.llmEncryptionService.encryptForTenant).not.toHaveBeenCalled();
    expect(inserted).not.toHaveProperty('isEncrypted');
    expect(inserted).not.toHaveProperty('encryptionMetadata');
    expect(inserted.contentHash).toBe(inserted.packet.contentHash as string);
  });

  it('E2EE 禁用时不会对任意可加密 sourceType 应用加密', async () => {
    mocks.uuidv7
      .mockReturnValueOnce(GENERATED_ID_1)
      .mockReturnValueOnce(GENERATED_ID_2);
    queueOrgLookup([{ id: ORG_ID }]);
    const insertMock = setupInsertReturning();

    const promise = service.createBatchEvidenceRecords(
      TENANT_ID,
      EXECUTION_ID,
      [
        {
          stepId: STEP_ID,
          sourceType: 'agent_decision',
          packet: createAgentDecisionPacketInput(),
        },
        {
          stepId: STEP_ID,
          sourceType: 'tool_output',
          packet: createToolOutputPacketInput(),
        },
      ],
    );

    await vi.advanceTimersByTimeAsync(50);
    await promise;

    const inserted = insertMock.getCapturedValues() as CapturedInsertValue[];

    expect(mocks.llmEncryptionService.isE2EEEnabled).toHaveBeenCalledWith(
      TENANT_ID,
      ORG_ID,
    );
    expect(mocks.llmEncryptionService.encryptForTenant).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(2);
    inserted.forEach((entry) => {
      expect(entry).not.toHaveProperty('isEncrypted');
      expect(entry).not.toHaveProperty('encryptionMetadata');
      expect(entry.contentHash).toBe(entry.packet.contentHash as string);
    });
  });

  it('加密失败时会按条目优雅降级并保留原始明文数据', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    mocks.uuidv7
      .mockReturnValueOnce(GENERATED_ID_1)
      .mockReturnValueOnce(GENERATED_ID_2);
    queueOrgLookup([{ id: ORG_ID }]);
    const insertMock = setupInsertReturning();

    mocks.llmEncryptionService.isE2EEEnabled.mockResolvedValue(true);
    mocks.llmEncryptionService.encryptForTenant
      .mockRejectedValueOnce(new Error('first encryption failed'))
      .mockResolvedValueOnce(
        createEncryptedPayload({ ciphertext: 'second-entry-ciphertext' }),
      );

    const promise = service.createBatchEvidenceRecords(
      TENANT_ID,
      EXECUTION_ID,
      [
        {
          stepId: STEP_ID,
          sourceType: 'agent_decision',
          packet: createAgentDecisionPacketInput(),
        },
        {
          stepId: STEP_ID,
          sourceType: 'tool_output',
          packet: createToolOutputPacketInput(),
        },
      ],
    );

    await vi.advanceTimersByTimeAsync(50);
    await promise;

    const [firstEntry, secondEntry] =
      insertMock.getCapturedValues() as CapturedInsertValue[];

    expect(mocks.llmEncryptionService.encryptForTenant).toHaveBeenCalledTimes(
      2,
    );
    expect(firstEntry).not.toHaveProperty('isEncrypted');
    expect(firstEntry).not.toHaveProperty('encryptionMetadata');
    expect(firstEntry.contentHash).toBe(
      firstEntry.packet.contentHash as string,
    );
    expect(secondEntry.isEncrypted).toBe(true);
    expect(secondEntry.packet).toHaveProperty(
      'encryptedPacket.ciphertext',
      'second-entry-ciphertext',
    );
    expect(secondEntry.contentHash).toBe(
      secondEntry.packet.contentHash as string,
    );
    expect(secondEntry.contentHash).toBe(
      computeStoredPacketHash(secondEntry.packet),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('E2EE: 证据加密失败，保留明文'),
      { evidenceId: GENERATED_ID_1 },
    );
  });

  it('resolveOrgId 返回 null 时不会尝试加密证据', async () => {
    mocks.uuidv7.mockReturnValue(GENERATED_ID_1);
    queueOrgLookup([]);
    const insertMock = setupInsertReturning();

    await service.createEvidenceRecord(TENANT_ID, EXECUTION_ID, {
      stepId: STEP_ID,
      sourceType: 'agent_decision',
      packet: createAgentDecisionPacketInput(),
    });

    const [inserted] = insertMock.getCapturedValues() as CapturedInsertValue[];

    expect(mocks.llmEncryptionService.isE2EEEnabled).not.toHaveBeenCalled();
    expect(mocks.llmEncryptionService.encryptForTenant).not.toHaveBeenCalled();
    expect(inserted).not.toHaveProperty('isEncrypted');
    expect(inserted).not.toHaveProperty('encryptionMetadata');
    expect(inserted.contentHash).toBe(inserted.packet.contentHash as string);
  });
});
