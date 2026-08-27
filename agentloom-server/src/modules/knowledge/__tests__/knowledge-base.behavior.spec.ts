import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import type { CreateKnowledgeBaseDto } from '../dto';
import {
  createDefaultChunkingStrategy,
  createDefaultQueryOrchestration,
  createDefaultRetrievalStrategy,
  createDefaultRerankerStrategy,
} from '../knowledge-base-config';
import {
  KnowledgeBaseNotFoundException,
  KnowledgeEmbeddingModelNotConfiguredException,
} from '../knowledge.exceptions';
import { KnowledgeBaseService } from '../knowledge-base.service';

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(),
}));

const TENANT_ID = 'tenant-knowledge';
const USER_ID = 'user-knowledge';
const KB_ID = 'kb-knowledge';

interface TestDb {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
}

function knowledgeBaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: KB_ID,
    tenantId: TENANT_ID,
    name: 'Knowledge',
    description: null,
    visibility: 'private' as const,
    embeddingModel: 'legacy-embedding',
    embeddingModelConfigId: null,
    chunkingStrategy: createDefaultChunkingStrategy(),
    retrievalStrategy: createDefaultRetrievalStrategy(),
    rerankingStrategy: createDefaultRerankerStrategy(),
    queryOrchestration: createDefaultQueryOrchestration(),
    createdBy: USER_ID,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function createKnowledgeBaseDto(
  overrides: Partial<CreateKnowledgeBaseDto> = {},
): CreateKnowledgeBaseDto {
  return {
    name: 'Knowledge',
    description: undefined,
    visibility: 'private',
    embeddingModel: undefined,
    embeddingModelConfigId: undefined,
    chunkingStrategy: undefined,
    retrievalStrategy: undefined,
    rerankingStrategy: undefined,
    queryOrchestration: undefined,
    ...overrides,
  };
}

function pagedSelect(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue({ offset: vi.fn().mockResolvedValue(result) }),
        }),
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function resolvedSelect(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }),
  };
}

function groupedSelect(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi
        .fn()
        .mockReturnValue({ groupBy: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

describe('KnowledgeBaseService behavior contracts', () => {
  let service: KnowledgeBaseService;
  let db: TestDb;
  let llm: { findById: Mock; findDefaultByType: Mock };
  let resources: {
    mapCurrentKinds: Mock;
    buildShareImportedExistsCondition: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    llm = {
      findById: vi.fn(),
      findDefaultByType: vi.fn().mockResolvedValue(null),
    };
    resources = {
      mapCurrentKinds: vi.fn().mockResolvedValue(new Map()),
      buildShareImportedExistsCondition: vi
        .fn()
        .mockReturnValue({ imported: true }),
    };
    vi.mocked(getTenantDb).mockReturnValue(db as never);
    service = new KnowledgeBaseService(
      db as never,
      llm as never,
      resources as never,
    );
  });

  it('create resolves an explicitly configured embedding model and persists its canonical identity', async () => {
    llm.findById.mockResolvedValue({
      id: 'embedding-config',
      modelId: 'text-embedding-3-large',
      modelType: 'embedding',
    });
    const returning = vi.fn().mockResolvedValue([
      knowledgeBaseRow({
        embeddingModel: 'text-embedding-3-large',
        embeddingModelConfigId: 'embedding-config',
      }),
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert.mockReturnValue({ values });

    await expect(
      service.create(
        createKnowledgeBaseDto({
          embeddingModel: 'ignored-client-name',
          embeddingModelConfigId: 'embedding-config',
        }),
        TENANT_ID,
        USER_ID,
      ),
    ).resolves.toMatchObject({
      embeddingModel: 'text-embedding-3-large',
      embeddingModelConfigId: 'embedding-config',
      status: 'empty',
      sourceKind: 'manual',
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingModel: 'text-embedding-3-large',
        embeddingModelConfigId: 'embedding-config',
        chunkingStrategy: createDefaultChunkingStrategy(),
        retrievalStrategy: createDefaultRetrievalStrategy(),
        rerankingStrategy: createDefaultRerankerStrategy(),
        queryOrchestration: createDefaultQueryOrchestration(),
      }),
    );
  });

  it('create rejects a configured chat model before writing storage', async () => {
    llm.findById.mockResolvedValue({
      id: 'chat',
      modelId: 'chat',
      modelType: 'chat',
    });
    await expect(
      service.create(
        createKnowledgeBaseDto({
          name: 'Invalid',
          embeddingModelConfigId: 'chat',
        }),
        TENANT_ID,
        USER_ID,
      ),
    ).rejects.toThrow('知识库只能绑定 Embedding 模型配置');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('create prefers the tenant default embedding model over a legacy requested name', async () => {
    llm.findDefaultByType.mockResolvedValue({
      id: 'default-config',
      modelId: 'default-model',
    });
    const values = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        knowledgeBaseRow({
          embeddingModel: 'default-model',
          embeddingModelConfigId: 'default-config',
        }),
      ]),
    });
    db.insert.mockReturnValue({ values });

    await service.create(
      createKnowledgeBaseDto({
        name: 'Defaulted',
        embeddingModel: 'legacy-request',
      }),
      TENANT_ID,
      USER_ID,
    );
    expect(llm.findDefaultByType).toHaveBeenCalledWith(TENANT_ID, 'embedding');
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingModel: 'default-model',
        embeddingModelConfigId: 'default-config',
      }),
    );
  });

  it('create rejects when neither a bound model config nor a tenant default embedding model exists', async () => {
    // 旧行为是回退到裸模型名（无 provider/endpoint/凭据），索引必然失败且被
    // 表现成网络错误。现在配置缺失必须在建库时就显式失败。
    const values = vi.fn();
    db.insert.mockReturnValue({ values });

    await expect(
      service.create(
        createKnowledgeBaseDto({
          name: 'Legacy',
          embeddingModel: 'legacy-request',
        }),
        TENANT_ID,
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(KnowledgeEmbeddingModelNotConfiguredException);

    expect(values).not.toHaveBeenCalled();
  });

  it('source filtering distinguishes imported resources from manual resources', async () => {
    db.select
      .mockReturnValueOnce(pagedSelect([]))
      .mockReturnValueOnce(resolvedSelect([{ total: 0 }]))
      .mockReturnValueOnce(pagedSelect([]))
      .mockReturnValueOnce(resolvedSelect([{ total: 0 }]));

    await service.findAllByTenant(TENANT_ID, 2, 5, 'share_imported');
    await service.findAllByTenant(TENANT_ID, 1, 10, 'manual');
    expect(resources.buildShareImportedExistsCondition).toHaveBeenCalledTimes(
      2,
    );
    expect(resources.buildShareImportedExistsCondition).toHaveBeenCalledWith({
      resourceType: 'knowledge_base',
      resourceIdColumn: expect.anything(),
    });
  });

  it('summary pagination short-circuits hydration for an empty page', async () => {
    db.select
      .mockReturnValueOnce(pagedSelect([]))
      .mockReturnValueOnce(resolvedSelect([{ total: 12 }]));
    await expect(
      service.findSummariesByTenant(TENANT_ID, 3, 5),
    ).resolves.toEqual({
      data: [],
      total: 12,
    });
    expect(resources.mapCurrentKinds).not.toHaveBeenCalled();
  });

  it.each([
    ['uploaded', 'processing'],
    ['processing', 'processing'],
    ['ready', 'ready'],
    ['failed', 'failed'],
  ] as const)(
    'a sole %s document produces %s knowledge status',
    async (documentStatus, expectedStatus) => {
      db.select
        .mockReturnValueOnce(pagedSelect([knowledgeBaseRow()]))
        .mockReturnValueOnce(
          resolvedSelect([{ knowledgeBaseId: KB_ID, status: documentStatus }]),
        )
        .mockReturnValueOnce(groupedSelect([]));
      await expect(
        service.findSummaryByIdOrThrow(KB_ID, TENANT_ID),
      ).resolves.toMatchObject({
        documentCount: 1,
        nodeCount: 0,
        chunkCount: 0,
        status: expectedStatus,
        sourceKind: 'manual',
      });
    },
  );

  it('ready takes precedence over failed while processing takes precedence over ready', async () => {
    db.select
      .mockReturnValueOnce(pagedSelect([knowledgeBaseRow()]))
      .mockReturnValueOnce(
        resolvedSelect([
          { knowledgeBaseId: KB_ID, status: 'failed' },
          { knowledgeBaseId: KB_ID, status: 'ready' },
        ]),
      )
      .mockReturnValueOnce(
        groupedSelect([{ knowledgeBaseId: KB_ID, nodeCount: 2 }]),
      );
    await expect(
      service.findSummaryByIdOrThrow(KB_ID, TENANT_ID),
    ).resolves.toMatchObject({
      status: 'ready',
      documentCount: 2,
    });

    db.select
      .mockReturnValueOnce(pagedSelect([knowledgeBaseRow()]))
      .mockReturnValueOnce(
        resolvedSelect([
          { knowledgeBaseId: KB_ID, status: 'ready' },
          { knowledgeBaseId: KB_ID, status: 'processing' },
        ]),
      )
      .mockReturnValueOnce(groupedSelect([]));
    await expect(
      service.findSummaryByIdOrThrow(KB_ID, TENANT_ID),
    ).resolves.toMatchObject({
      status: 'processing',
    });
  });

  it('summary hydration preserves imported source kind and isolates counters per knowledge base', async () => {
    const secondId = 'kb-second';
    resources.mapCurrentKinds.mockResolvedValue(
      new Map([[secondId, 'share_imported']]),
    );
    db.select
      .mockReturnValueOnce(
        pagedSelect([knowledgeBaseRow(), knowledgeBaseRow({ id: secondId })]),
      )
      .mockReturnValueOnce(resolvedSelect([{ total: 2 }]))
      .mockReturnValueOnce(
        resolvedSelect([{ knowledgeBaseId: KB_ID, status: 'failed' }]),
      )
      .mockReturnValueOnce(
        groupedSelect([{ knowledgeBaseId: secondId, nodeCount: 6 }]),
      );

    await expect(
      service.findSummariesByTenant(TENANT_ID, 1, 10),
    ).resolves.toEqual({
      total: 2,
      data: [
        expect.objectContaining({
          id: KB_ID,
          status: 'failed',
          documentCount: 1,
          nodeCount: 0,
          sourceKind: 'manual',
        }),
        expect.objectContaining({
          id: secondId,
          status: 'empty',
          documentCount: 0,
          nodeCount: 6,
          sourceKind: 'share_imported',
        }),
      ],
    });
  });

  it('findSummaryByIdOrThrow preserves the not-found contract when hydration yields no summary', async () => {
    db.select.mockReturnValueOnce(pagedSelect([knowledgeBaseRow()]));
    const hydrate = vi
      .spyOn(
        service as unknown as {
          hydrateSummaries(
            items: unknown[],
            tenantId: string,
          ): Promise<unknown[]>;
        },
        'hydrateSummaries',
      )
      .mockResolvedValue([]);
    await expect(
      service.findSummaryByIdOrThrow(KB_ID, TENANT_ID),
    ).rejects.toBeInstanceOf(KnowledgeBaseNotFoundException);
    expect(hydrate).toHaveBeenCalled();
  });

  it('delete scopes the storage mutation to id and tenant', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where });
    await expect(service.delete(KB_ID, TENANT_ID)).resolves.toBeUndefined();
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('delete propagates storage failures instead of reporting a false success', async () => {
    const storageError = new Error('knowledge storage unavailable');
    db.delete.mockReturnValue({
      where: vi.fn().mockRejectedValue(storageError),
    });
    await expect(service.delete(KB_ID, TENANT_ID)).rejects.toBe(storageError);
  });

  it('create propagates insert failures and does not fabricate a summary', async () => {
    const storageError = new Error('insert failed');
    llm.findDefaultByType.mockResolvedValue({
      id: 'config-default',
      modelId: 'text-embedding-3-small',
      modelType: 'embedding',
    });
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(storageError),
      }),
    });
    await expect(
      service.create(
        createKnowledgeBaseDto({
          name: 'Unstored',
          embeddingModel: 'legacy',
        }),
        TENANT_ID,
        USER_ID,
      ),
    ).rejects.toBe(storageError);
  });

  it('updateSettings skips storage writes for an empty patch and returns the current summary', async () => {
    const current = knowledgeBaseRow();
    db.select
      .mockReturnValueOnce(pagedSelect([current]))
      .mockReturnValueOnce(pagedSelect([current]))
      .mockReturnValueOnce(resolvedSelect([]))
      .mockReturnValueOnce(groupedSelect([]));
    await expect(
      service.updateSettings(KB_ID, TENANT_ID, {}),
    ).resolves.toMatchObject({
      id: KB_ID,
      status: 'empty',
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updateSettings can replace only the model configuration and uses its canonical model name', async () => {
    const current = knowledgeBaseRow();
    llm.findById.mockResolvedValue({
      id: 'new-config',
      modelId: 'canonical-embedding',
      modelType: 'embedding',
    });
    const set = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    db.update.mockReturnValue({ set });
    db.select
      .mockReturnValueOnce(pagedSelect([current]))
      .mockReturnValueOnce(
        pagedSelect([
          knowledgeBaseRow({
            embeddingModel: 'canonical-embedding',
            embeddingModelConfigId: 'new-config',
          }),
        ]),
      )
      .mockReturnValueOnce(resolvedSelect([]))
      .mockReturnValueOnce(groupedSelect([]));

    await service.updateSettings(KB_ID, TENANT_ID, {
      embeddingModelConfigId: 'new-config',
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingModel: 'canonical-embedding',
        embeddingModelConfigId: 'new-config',
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('strategy accessors return stored values and independently default missing values', () => {
    const chunking = { type: 'markdown' as const };
    const retrieval = { topK: 2, similarityThreshold: 0.9 };
    const reranking = { type: 'none' as const };
    const orchestration = { type: 'none' as const };
    expect(service.getChunkingStrategy({ chunkingStrategy: chunking })).toBe(
      chunking,
    );
    expect(service.getRetrievalStrategy({ retrievalStrategy: retrieval })).toBe(
      retrieval,
    );
    expect(service.getRerankingStrategy({ rerankingStrategy: reranking })).toBe(
      reranking,
    );
    expect(
      service.getQueryOrchestration({ queryOrchestration: orchestration }),
    ).toBe(orchestration);
    expect(
      service.getChunkingStrategy({ chunkingStrategy: undefined } as never),
    ).toEqual(createDefaultChunkingStrategy());
    expect(
      service.getRetrievalStrategy({ retrievalStrategy: undefined } as never),
    ).toEqual(createDefaultRetrievalStrategy());
    expect(
      service.getRerankingStrategy({ rerankingStrategy: undefined } as never),
    ).toEqual(createDefaultRerankerStrategy());
    expect(
      service.getQueryOrchestration({
        queryOrchestration: undefined,
      } as never),
    ).toEqual(createDefaultQueryOrchestration());
  });
});
