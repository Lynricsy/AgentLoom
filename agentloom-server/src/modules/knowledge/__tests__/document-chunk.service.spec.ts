import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

import { DRIZZLE } from '../../../database/database.module';
import { DocumentChunkService } from '../document-chunk.service';
import type { DocumentChunk } from '../interfaces/document-parser.interface';
import { DocumentChunkException } from '../knowledge.exceptions';

describe('DocumentChunkService', () => {
  let service: DocumentChunkService;
  let db: Record<string, ReturnType<typeof vi.fn>>;

  const mockTenantDb = {
    insert: vi.fn(),
    select: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    db = { __brand: 'drizzle' } as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >;

    mocks.getTenantDb.mockReturnValue(mockTenantDb);

    const module = await Test.createTestingModule({
      providers: [DocumentChunkService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get(DocumentChunkService);
  });

  const sampleChunks: DocumentChunk[] = [
    {
      content: '第一个分块内容',
      location: {
        page: null,
        paragraph: 0,
        heading: null,
        charOffset: 0,
        charLength: 7,
      },
      tokenCount: 10,
    },
    {
      content: '第二个分块内容',
      location: {
        page: null,
        paragraph: 1,
        heading: '标题',
        charOffset: 7,
        charLength: 7,
      },
      tokenCount: 12,
    },
  ];

  /** 配置 mockTenantDb.select 返回源文档信息（用于 createChunks 内部查询） */
  function mockSourceDocSelect(
    tenantId = 'tenant-id',
    knowledgeBaseId = 'kb-id',
  ) {
    mockTenantDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ tenantId, knowledgeBaseId }]),
        }),
      }),
    });
  }

  describe('createChunks', () => {
    it('应批量创建文档分块并返回数量', async () => {
      mockSourceDocSelect('tenant-id', 'kb-id');

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockTenantDb.insert.mockReturnValue({ values: mockValues });

      const count = await service.createChunks('doc-id', sampleChunks);

      expect(count).toBe(2);
      expect(mockTenantDb.insert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            documentId: 'doc-id',
            tenantId: 'tenant-id',
            knowledgeBaseId: 'kb-id',
            chunkIndex: 0,
            content: '第一个分块内容',
            tokenCount: 10,
          }),
          expect.objectContaining({
            chunkIndex: 1,
            content: '第二个分块内容',
            tokenCount: 12,
          }),
        ]),
      );
    });

    it('应从源文档继承 tenantId 和 knowledgeBaseId，而非由调用方传入', async () => {
      // 源文档返回 db-tenant / db-kb，验证写入时使用的是 DB 中的值
      mockSourceDocSelect('db-tenant', 'db-kb');

      const capturedValues: unknown[] = [];
      mockTenantDb.insert.mockReturnValue({
        values: vi.fn().mockImplementation((vals) => {
          capturedValues.push(...vals);
          return Promise.resolve(undefined);
        }),
      });

      await service.createChunks('doc-id', sampleChunks);

      for (const val of capturedValues as Array<Record<string, string>>) {
        expect(val.tenantId).toBe('db-tenant');
        expect(val.knowledgeBaseId).toBe('db-kb');
      }
    });

    it('源文档不存在时应抛出 DocumentChunkException', async () => {
      // select 返回空数组，模拟源文档不存在
      mockTenantDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        service.createChunks('non-existent-doc', sampleChunks),
      ).rejects.toThrow(DocumentChunkException);
    });

    it('应在数据库写入失败时抛出 DocumentChunkException', async () => {
      mockSourceDocSelect();
      mockTenantDb.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('DB 错误')),
      });

      await expect(
        service.createChunks('doc-id', sampleChunks),
      ).rejects.toThrow(DocumentChunkException);
    });

    it('chunks 为空时应直接返回 0，无需查询源文档', async () => {
      const count = await service.createChunks('doc-id', []);

      expect(count).toBe(0);
      // 不应触发任何 DB 查询
      expect(mockTenantDb.select).not.toHaveBeenCalled();
      expect(mockTenantDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('findByDocumentId', () => {
    it('应按 chunkIndex 升序返回文档分块', async () => {
      const mockRows = [
        { id: '1', chunkIndex: 0, content: 'A' },
        { id: '2', chunkIndex: 1, content: 'B' },
      ];
      mockTenantDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockRows),
          }),
        }),
      });

      const result = await service.findByDocumentId('doc-id', 'tenant-id');

      expect(result).toEqual(mockRows);
      expect(mockTenantDb.select).toHaveBeenCalled();
    });
  });

  describe('deleteByDocumentId', () => {
    it('应删除指定文档的所有分块并返回删除数量', async () => {
      const deletedRows = [{ id: '1' }, { id: '2' }, { id: '3' }];
      mockTenantDb.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(deletedRows),
        }),
      });

      const count = await service.deleteByDocumentId('doc-id', 'tenant-id');

      expect(count).toBe(3);
    });
  });

  describe('countByDocumentId', () => {
    it('应返回文档的分块总数', async () => {
      mockTenantDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const count = await service.countByDocumentId('doc-id', 'tenant-id');

      expect(count).toBe(5);
    });

    it('应在无分块时返回 0', async () => {
      mockTenantDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      const count = await service.countByDocumentId('doc-id', 'tenant-id');

      expect(count).toBe(0);
    });
  });
});
