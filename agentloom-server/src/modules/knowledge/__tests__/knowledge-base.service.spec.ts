import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { KnowledgeBaseNotFoundException } from '../knowledge.exceptions';
import { DRIZZLE } from '../../../database/database.module';
import { LlmService } from '../../llm/llm.service';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
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

function createSelectChain(result: unknown) {
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
    mocks.getTenantDb.mockReturnValue(db);

    const module = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: DRIZZLE, useValue: db },
        { provide: LlmService, useValue: llmService },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
  });

  describe('create', () => {
    it('应创建知识库并返回结果', async () => {
      const dto = {
        name: '测试知识库',
        description: '描述',
        visibility: 'private' as const,
        chunkSize: 512,
        chunkOverlap: 64,
        embeddingModel: 'text-embedding-3-small',
        embeddingModelConfigId: null,
      };
      const expectedKB = {
        id: KB_ID,
        tenantId: TENANT_ID,
        ...dto,
        createdBy: USER_ID,
        documentCount: 0,
        chunkCount: 0,
        status: 'empty' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      db.insert.mockReturnValue(createInsertChain([expectedKB]));

      const result = await service.create(dto, TENANT_ID, USER_ID);

      expect(result).toEqual(expectedKB);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('应按租户条件删除知识库', async () => {
      const where = vi.fn().mockResolvedValue(undefined);
      db.delete.mockReturnValue({ where });

      await expect(service.delete(KB_ID, TENANT_ID)).resolves.toBeUndefined();

      expect(db.delete).toHaveBeenCalled();
      expect(where).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAllByTenant', () => {
    it('应返回分页的知识库列表和总数', async () => {
      const kbList = [{ id: KB_ID, name: '知识库1', tenantId: TENANT_ID }];
      const totalResult = [{ total: 1 }];

      const selectChain1 = createSelectChain(kbList);
      const selectChain2 = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(totalResult),
        }),
      };

      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      const result = await service.findAllByTenant(TENANT_ID, 1, 10);

      expect(result.data).toEqual(kbList);
      expect(result.total).toBe(1);
      expect(db.select).toHaveBeenCalledTimes(2);
    });
  });

  describe('findByIdOrThrow', () => {
    it('应返回查找到的知识库', async () => {
      const expectedKB = { id: KB_ID, tenantId: TENANT_ID, name: '测试' };
      const selectChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([expectedKB]),
          }),
        }),
      };
      db.select.mockReturnValue(selectChain);

      const result = await service.findByIdOrThrow(KB_ID, TENANT_ID);

      expect(result).toEqual(expectedKB);
    });

    it('知识库不存在时应抛出 KnowledgeBaseNotFoundException', async () => {
      const selectChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      db.select.mockReturnValue(selectChain);

      await expect(service.findByIdOrThrow(KB_ID, TENANT_ID)).rejects.toThrow(
        KnowledgeBaseNotFoundException,
      );
    });
  });

  describe('findSummaryByIdOrThrow', () => {
    it('应派生文档数、分块数和 processing 状态摘要', async () => {
      const baseKnowledgeBase = {
        id: KB_ID,
        tenantId: TENANT_ID,
        name: '测试知识库',
        description: '用于摘要测试',
        visibility: 'private' as const,
        chunkSize: 512,
        chunkOverlap: 64,
        embeddingModel: 'text-embedding-3-small',
        embeddingModelConfigId: null,
        createdBy: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      db.select
        .mockReturnValueOnce(createSelectChain([baseKnowledgeBase]))
        .mockReturnValueOnce(
          createWhereResolvedChain([
            { knowledgeBaseId: KB_ID, status: 'uploaded' },
            { knowledgeBaseId: KB_ID, status: 'ready' },
          ]),
        )
        .mockReturnValueOnce(
          createGroupedWhereChain([{ knowledgeBaseId: KB_ID, chunkCount: 7 }]),
        );

      const result = await service.findSummaryByIdOrThrow(KB_ID, TENANT_ID);

      expect(result).toMatchObject({
        ...baseKnowledgeBase,
        documentCount: 2,
        chunkCount: 7,
        status: 'processing',
      });
    });
  });

  describe('updateSettings', () => {
    it('应持久化设置并返回最新摘要', async () => {
      const originalKnowledgeBase = {
        id: KB_ID,
        tenantId: TENANT_ID,
        name: '测试知识库',
        description: '旧描述',
        visibility: 'private' as const,
        chunkSize: 512,
        chunkOverlap: 64,
        embeddingModel: 'text-embedding-3-small',
        embeddingModelConfigId: null,
        createdBy: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updatedKnowledgeBase = {
        ...originalKnowledgeBase,
        chunkSize: 1024,
        chunkOverlap: 128,
        embeddingModel: 'text-embedding-3-large',
        embeddingModelConfigId: null,
      };

      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const set = vi.fn().mockReturnValue({ where: updateWhere });
      db.update.mockReturnValue({ set });

      db.select
        .mockReturnValueOnce(createSelectChain([originalKnowledgeBase]))
        .mockReturnValueOnce(createSelectChain([updatedKnowledgeBase]))
        .mockReturnValueOnce(
          createWhereResolvedChain([
            { knowledgeBaseId: KB_ID, status: 'ready' },
          ]),
        )
        .mockReturnValueOnce(
          createGroupedWhereChain([{ knowledgeBaseId: KB_ID, chunkCount: 3 }]),
        );

      const result = await service.updateSettings(KB_ID, TENANT_ID, {
        chunkSize: 1024,
        chunkOverlap: 128,
        embeddingModel: 'text-embedding-3-large',
        embeddingModelConfigId: null,
      });

      expect(db.update).toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          chunkSize: 1024,
          chunkOverlap: 128,
          embeddingModel: 'text-embedding-3-large',
          updatedAt: expect.any(Date),
        }),
      );
      expect(result).toMatchObject({
        ...updatedKnowledgeBase,
        documentCount: 1,
        chunkCount: 3,
        status: 'ready',
      });
    });
  });
});
