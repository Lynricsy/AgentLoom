import { Test } from '@nestjs/testing';
import { MetadataMode, TextNode } from 'llamaindex';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTenantDb } from '../../../common/providers/tenant-aware-db.provider';
import { DRIZZLE } from '../../../database/database.module';
import { DocumentChunkException } from '../knowledge.exceptions';
import { KnowledgeNodeService } from '../knowledge-node.service';

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: vi.fn(),
}));

describe('KnowledgeNodeService', () => {
  let service: KnowledgeNodeService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let mockTenantDb: {
    insert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    db = { __brand: 'drizzle' } as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >;

    mockTenantDb = {
      insert: vi.fn(),
      select: vi.fn(),
      delete: vi.fn(),
    };

    vi.mocked(getTenantDb).mockReturnValue(mockTenantDb as never);

    const module = await Test.createTestingModule({
      providers: [KnowledgeNodeService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = module.get(KnowledgeNodeService);
  });

  function createNode(id: string, text: string) {
    return new TextNode({
      id_: id,
      text,
      metadata: {
        documentId: 'doc-id',
        page: 1,
      },
    });
  }

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

  it('replaceNodes 应删除旧节点并写入新的知识节点', async () => {
    const nodes = [
      createNode('node-1', '第一个知识节点'),
      createNode('node-2', '第二个知识节点'),
    ];

    mockSourceDocSelect('tenant-id', 'kb-id');
    mockTenantDb.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockTenantDb.insert.mockReturnValue({ values: insertValues });

    const count = await service.replaceNodes('doc-id', nodes);

    expect(count).toBe(2);
    expect(insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-1',
          documentId: 'doc-id',
          tenantId: 'tenant-id',
          knowledgeBaseId: 'kb-id',
          nodeIndex: 0,
          content: nodes[0].getContent(MetadataMode.NONE),
          metadata: expect.objectContaining({
            documentId: 'doc-id',
            page: 1,
          }),
        }),
        expect.objectContaining({
          id: 'node-2',
          nodeIndex: 1,
          content: nodes[1].getContent(MetadataMode.NONE),
        }),
      ]),
    );
  });

  it('replaceNodes 在源文档不存在时应抛出异常', async () => {
    mockTenantDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    await expect(
      service.replaceNodes('missing-doc', [createNode('node-1', '内容')]),
    ).rejects.toThrow(DocumentChunkException);
  });

  it('findByDocumentId 应按 nodeIndex 升序返回节点', async () => {
    const rows = [
      { id: 'node-1', nodeIndex: 0 },
      { id: 'node-2', nodeIndex: 1 },
    ];

    mockTenantDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(rows),
        }),
      }),
    });

    await expect(
      service.findByDocumentId('doc-id', 'tenant-id'),
    ).resolves.toEqual(rows);
  });

  it('deleteByDocumentId 应返回删除节点数量', async () => {
    mockTenantDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: 'node-1' }, { id: 'node-2' }]),
      }),
    });

    await expect(
      service.deleteByDocumentId('doc-id', 'tenant-id'),
    ).resolves.toBe(2);
  });

  it('countByDocumentId 应返回节点总数', async () => {
    mockTenantDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 5 }]),
      }),
    });

    await expect(
      service.countByDocumentId('doc-id', 'tenant-id'),
    ).resolves.toBe(5);
  });
});
