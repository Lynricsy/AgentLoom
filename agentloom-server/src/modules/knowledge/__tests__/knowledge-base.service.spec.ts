import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE } from '../../../database/database.module';
import { LlmService } from '../../llm/llm.service';
import { ResourceSourceService } from '../../resource-source/resource-source.service';
import {
  createDefaultChunkingStrategy,
  createDefaultQueryOrchestration,
  createDefaultRetrievalStrategy,
  createDefaultRerankerStrategy,
} from '../knowledge-base-config';
import { KnowledgeBaseNotFoundException } from '../knowledge.exceptions';
import { KnowledgeBaseService } from '../knowledge-base.service';

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(),
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const KB_ID = '00000000-0000-0000-0000-000000000010';

function createInsertChain(result: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createPagedSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(result),
          }),
        }),
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createWhereResolvedChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createGroupedWhereChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        groupBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let llmService: {
    findById: ReturnType<typeof vi.fn>;
    findDefaultByType: ReturnType<typeof vi.fn>;
  };
  let resourceSourceService: {
    mapCurrentKinds: ReturnType<typeof vi.fn>;
    buildShareImportedExistsCondition: ReturnType<typeof vi.fn>;
  };

  function createKnowledgeBaseRow(overrides: Record<string, unknown> = {}) {
    return {
      id: KB_ID,
      tenantId: TENANT_ID,
      name: '测试知识库',
      description: '描述',
      visibility: 'private' as const,
      embeddingModel: 'text-embedding-3-small',
      embeddingModelConfigId: null,
      chunkingStrategy: createDefaultChunkingStrategy(),
      retrievalStrategy: createDefaultRetrievalStrategy(),
      rerankingStrategy: createDefaultRerankerStrategy(),
      queryOrchestration: createDefaultQueryOrchestration(),
      createdBy: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      sourceKind: 'manual',
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    llmService = {
      findById: vi.fn(),
      findDefaultByType: vi.fn().mockResolvedValue(null),
    };
    resourceSourceService = {
      mapCurrentKinds: vi.fn().mockResolvedValue(new Map()),
      buildShareImportedExistsCondition: vi.fn(() => ({
        type: 'share-imported',
      })),
    };
    vi.mocked(getTenantDb).mockReturnValue(db as never);

    const module = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: DRIZZLE, useValue: db },
        { provide: LlmService, useValue: llmService },
        { provide: ResourceSourceService, useValue: resourceSourceService },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
  });

  it('create 应创建知识库并返回带默认统计的摘要', async () => {
    const dto = {
      name: '测试知识库',
      description: '描述',
      visibility: 'private' as const,
      embeddingModel: 'text-embedding-3-small',
      embeddingModelConfigId: null,
      chunkingStrategy: {
        type: 'sentence',
        chunkSize: 1024,
        chunkOverlap: 128,
      } as const,
      retrievalStrategy: {
        topK: 12,
        similarityThreshold: 0.66,
      },
      rerankingStrategy: {
        type: 'none',
      } as const,
      queryOrchestration: {
        type: 'none',
      } as const,
    };
    const inserted = createKnowledgeBaseRow(dto);
    db.insert.mockReturnValue(createInsertChain([inserted]));

    await expect(service.create(dto, TENANT_ID, USER_ID)).resolves.toEqual({
      ...inserted,
      documentCount: 0,
      nodeCount: 0,
      chunkCount: 0,
      status: 'empty',
    });
  });

  it('findAllByTenant 应返回分页结果与总数', async () => {
    db.select
      .mockReturnValueOnce(createPagedSelectChain([createKnowledgeBaseRow()]))
      .mockReturnValueOnce(createWhereResolvedChain([{ total: 1 }]));

    await expect(service.findAllByTenant(TENANT_ID, 1, 10)).resolves.toEqual({
      data: [expect.objectContaining({ id: KB_ID })],
      total: 1,
    });
  });

  it('findByIdOrThrow 在知识库不存在时应抛错', async () => {
    db.select.mockReturnValue(createPagedSelectChain([]));

    await expect(service.findByIdOrThrow(KB_ID, TENANT_ID)).rejects.toThrow(
      KnowledgeBaseNotFoundException,
    );
  });

  it('findSummaryByIdOrThrow 应派生文档数、节点数和处理状态', async () => {
    const knowledgeBase = createKnowledgeBaseRow();

    db.select
      .mockReturnValueOnce(createPagedSelectChain([knowledgeBase]))
      .mockReturnValueOnce(
        createWhereResolvedChain([
          { knowledgeBaseId: KB_ID, status: 'uploaded' },
          { knowledgeBaseId: KB_ID, status: 'ready' },
        ]),
      )
      .mockReturnValueOnce(
        createGroupedWhereChain([{ knowledgeBaseId: KB_ID, nodeCount: 7 }]),
      );

    await expect(
      service.findSummaryByIdOrThrow(KB_ID, TENANT_ID),
    ).resolves.toMatchObject({
      ...knowledgeBase,
      documentCount: 2,
      nodeCount: 7,
      chunkCount: 7,
      status: 'processing',
    });
  });

  it('updateSettings 应持久化新策略并返回最新摘要', async () => {
    const originalKnowledgeBase = createKnowledgeBaseRow();
    const updatedKnowledgeBase = createKnowledgeBaseRow({
      embeddingModel: 'text-embedding-3-large',
      chunkingStrategy: {
        type: 'sentence',
        chunkSize: 1024,
        chunkOverlap: 128,
      },
      retrievalStrategy: {
        topK: 16,
        similarityThreshold: 0.51,
      },
      rerankingStrategy: {
        type: 'cohere',
        model: 'rerank-v3.5',
        topN: 6,
        apiKeyId: null,
        baseUrl: null,
        timeoutMs: null,
      },
      queryOrchestration: {
        type: 'hyde',
        modelConfigId: null,
        promptTemplate: 'query={{query}}',
      },
    });

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where: updateWhere });
    db.update.mockReturnValue({ set });

    db.select
      .mockReturnValueOnce(createPagedSelectChain([originalKnowledgeBase]))
      .mockReturnValueOnce(createPagedSelectChain([updatedKnowledgeBase]))
      .mockReturnValueOnce(
        createWhereResolvedChain([{ knowledgeBaseId: KB_ID, status: 'ready' }]),
      )
      .mockReturnValueOnce(
        createGroupedWhereChain([{ knowledgeBaseId: KB_ID, nodeCount: 3 }]),
      );

    const input = {
      embeddingModel: 'text-embedding-3-large',
      chunkingStrategy: {
        type: 'sentence',
        chunkSize: 1024,
        chunkOverlap: 128,
      } as const,
      retrievalStrategy: {
        topK: 16,
        similarityThreshold: 0.51,
      },
      rerankingStrategy: {
        type: 'cohere',
        model: 'rerank-v3.5',
        topN: 6,
        apiKeyId: null,
        baseUrl: null,
        timeoutMs: null,
      } as const,
      queryOrchestration: {
        type: 'hyde',
        modelConfigId: null,
        promptTemplate: 'query={{query}}',
      } as const,
      embeddingModelConfigId: null,
    };

    await expect(
      service.updateSettings(KB_ID, TENANT_ID, input),
    ).resolves.toMatchObject({
      ...updatedKnowledgeBase,
      documentCount: 1,
      nodeCount: 3,
      chunkCount: 3,
      status: 'ready',
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingModel: 'text-embedding-3-large',
        chunkingStrategy: input.chunkingStrategy,
        retrievalStrategy: input.retrievalStrategy,
        rerankingStrategy: input.rerankingStrategy,
        queryOrchestration: input.queryOrchestration,
        updatedAt: expect.any(Date),
      }),
    );
  });
});
