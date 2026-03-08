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
      providers: [
        DocumentChunkService,
        { provide: DRIZZLE, useValue: db },
      ],
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

  describe('createChunks', () => {
    it('应批量创建文档分块并返回数量', async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockTenantDb.insert.mockReturnValue({ values: mockValues });

      const count = await service.createChunks(
        'doc-id',
        'tenant-id',
        'kb-id',
        sampleChunks,
      );

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

    it('应在创建失败时抛出 DocumentChunkException', async () => {
      mockTenantDb.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('DB 错误')),
      });

      await expect(
        service.createChunks('doc-id', 'tenant-id', 'kb-id', sampleChunks),
      ).rejects.toThrow();
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
