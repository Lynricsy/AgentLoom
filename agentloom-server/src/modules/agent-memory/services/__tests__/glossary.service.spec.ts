import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  }),
  getTenantDb: vi.fn(),
  operators: {
    and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
  },
}));

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');

  return {
    ...actual,
    and: mocks.operators.and,
    eq: mocks.operators.eq,
  };
});

vi.mock('../../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

import type { DrizzleDB } from '../../../../database/database.module';
import {
  getTenantId,
  memoryGlossaryKeywords,
  type MemoryGlossaryKeyword,
  type MemoryNode,
} from '../../../../database/schema';
import { GlossaryService } from '../glossary.service';

type MockDb = ReturnType<typeof mocks.createMockDb>;

type SelectChain<TResult> = Promise<TResult[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';
const NODE_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_NODE_ID = '44444444-4444-4444-8444-444444444444';
const THIRD_NODE_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2025-02-01T08:00:00.000Z');

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  return chain;
}

function createInsertChain<TResult>(result: TResult[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });

  return {
    chain: { values },
    values,
    returning,
  };
}

function createDeleteChain<TResult>(result: TResult[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });

  return {
    chain: { where },
    where,
    returning,
  };
}

function createNode(overrides: Partial<MemoryNode> = {}): MemoryNode {
  return {
    id: NODE_ID,
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    contentType: 'text',
    metadata: { topic: 'agent-memory' },
    disclosureLevel: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function createGlossaryKeyword(
  overrides: Partial<MemoryGlossaryKeyword> = {},
): MemoryGlossaryKeyword {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    instanceId: INSTANCE_ID,
    tenantId: TENANT_ID,
    keyword: 'AI Agent',
    nodeId: NODE_ID,
    createdAt: NOW,
    ...overrides,
  };
}

describe('GlossaryService', () => {
  let service: GlossaryService;
  let rawDb: MockDb;
  let tenantDb: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = mocks.createMockDb();
    tenantDb = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(tenantDb as unknown as DrizzleDB);

    service = new GlossaryService(rawDb as unknown as DrizzleDB);
  });

  describe('addKeyword', () => {
    it('应校验节点并创建关键词绑定', async () => {
      const nodeQuery = createSelectChain([createNode()]);
      const createdKeyword = createGlossaryKeyword();
      const insertQuery = createInsertChain([createdKeyword]);

      tenantDb.select.mockReturnValueOnce(nodeQuery);
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.addKeyword(INSTANCE_ID, 'AI Agent', NODE_ID),
      ).resolves.toEqual(createdKeyword);

      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
      expect(tenantDb.insert).toHaveBeenCalledWith(memoryGlossaryKeywords);
      expect(insertQuery.values).toHaveBeenCalledWith({
        instanceId: INSTANCE_ID,
        tenantId: getTenantId,
        keyword: 'AI Agent',
        nodeId: NODE_ID,
      });
    });

    it('唯一索引冲突时应抛出 ConflictException', async () => {
      const uniqueViolation = Object.assign(new Error('duplicate key'), {
        code: '23505',
      });
      const insertQuery = createInsertChain<MemoryGlossaryKeyword>([]);
      insertQuery.returning.mockRejectedValueOnce(uniqueViolation);

      tenantDb.select.mockReturnValueOnce(createSelectChain([createNode()]));
      tenantDb.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(
        service.addKeyword(INSTANCE_ID, 'AI Agent', NODE_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('removeKeyword', () => {
    it('应按 instanceId + keyword + nodeId 删除绑定', async () => {
      const deleteQuery = createDeleteChain([{ id: 'deleted-keyword-id' }]);
      tenantDb.delete.mockReturnValueOnce(deleteQuery.chain);

      await expect(
        service.removeKeyword(INSTANCE_ID, 'AI Agent', NODE_ID),
      ).resolves.toBeUndefined();

      expect(tenantDb.delete).toHaveBeenCalledWith(memoryGlossaryKeywords);
      expect(deleteQuery.where).toHaveBeenCalledTimes(1);
    });
  });

  describe('scanText', () => {
    it('应懒构建自动机并缓存结果，重叠关键词取最长匹配', async () => {
      const glossaryQuery = createSelectChain([
        createGlossaryKeyword({ keyword: 'AI Agent', nodeId: NODE_ID }),
        createGlossaryKeyword({
          id: '77777777-7777-4777-8777-777777777777',
          keyword: 'Agent',
          nodeId: SECOND_NODE_ID,
        }),
        createGlossaryKeyword({
          id: '88888888-8888-4888-8888-888888888888',
          keyword: 'Memory',
          nodeId: THIRD_NODE_ID,
        }),
      ]);

      tenantDb.select.mockReturnValueOnce(glossaryQuery);

      await expect(
        service.scanText(INSTANCE_ID, 'AI Agent uses Memory for persistence'),
      ).resolves.toEqual([
        {
          keyword: 'AI Agent',
          nodeId: NODE_ID,
          position: 0,
        },
        {
          keyword: 'Memory',
          nodeId: THIRD_NODE_ID,
          position: 14,
        },
      ]);

      await expect(service.scanText(INSTANCE_ID, 'AI Agent')).resolves.toEqual([
        {
          keyword: 'AI Agent',
          nodeId: NODE_ID,
          position: 0,
        },
      ]);

      expect(tenantDb.select).toHaveBeenCalledTimes(1);
    });

    it('缓存失效后应在后台重建并继续使用旧自动机服务当前请求', async () => {
      tenantDb.select.mockReturnValueOnce(
        createSelectChain([
          createGlossaryKeyword({ keyword: 'Agent', nodeId: SECOND_NODE_ID }),
        ]),
      );

      await expect(service.scanText(INSTANCE_ID, 'Agent')).resolves.toEqual([
        {
          keyword: 'Agent',
          nodeId: SECOND_NODE_ID,
          position: 0,
        },
      ]);

      tenantDb.select.mockReturnValueOnce(createSelectChain([createNode()]));
      tenantDb.insert.mockReturnValueOnce(
        createInsertChain([
          createGlossaryKeyword({ keyword: 'AI Agent', nodeId: NODE_ID }),
        ]).chain,
      );

      await service.addKeyword(INSTANCE_ID, 'AI Agent', NODE_ID);

      const pendingRebuild = new Promise<void>(() => undefined);
      const rebuildSpy = vi
        .spyOn(service, 'rebuildAutomaton')
        .mockImplementationOnce(async () => {
          await pendingRebuild;
        });

      await expect(service.scanText(INSTANCE_ID, 'Agent')).resolves.toEqual([
        {
          keyword: 'Agent',
          nodeId: SECOND_NODE_ID,
          position: 0,
        },
      ]);

      expect(rebuildSpy).toHaveBeenCalledWith(INSTANCE_ID);
    });
  });

  describe('rebuildAutomaton', () => {
    it('应显式重建实例自动机并刷新扫描结果', async () => {
      tenantDb.select.mockReturnValueOnce(
        createSelectChain([
          createGlossaryKeyword({ keyword: 'Agent', nodeId: SECOND_NODE_ID }),
        ]),
      );

      await service.scanText(INSTANCE_ID, 'Agent');

      tenantDb.select
        .mockReturnValueOnce(createSelectChain([createNode()]))
        .mockReturnValueOnce(
          createSelectChain([
            createGlossaryKeyword({ keyword: 'AI Agent', nodeId: NODE_ID }),
            createGlossaryKeyword({ keyword: 'Memory', nodeId: THIRD_NODE_ID }),
          ]),
        );
      tenantDb.insert.mockReturnValueOnce(
        createInsertChain([
          createGlossaryKeyword({ keyword: 'AI Agent', nodeId: NODE_ID }),
        ]).chain,
      );

      await service.addKeyword(INSTANCE_ID, 'AI Agent', NODE_ID);
      await service.rebuildAutomaton(INSTANCE_ID);

      await expect(
        service.scanText(INSTANCE_ID, 'AI Agent uses Memory'),
      ).resolves.toEqual([
        {
          keyword: 'AI Agent',
          nodeId: NODE_ID,
          position: 0,
        },
        {
          keyword: 'Memory',
          nodeId: THIRD_NODE_ID,
          position: 14,
        },
      ]);
    });
  });

  describe('getKeywordsForNode', () => {
    it('应返回指定节点的全部关键词绑定', async () => {
      const keywords = [
        createGlossaryKeyword({ keyword: 'AI Agent', nodeId: NODE_ID }),
        createGlossaryKeyword({
          id: '99999999-9999-4999-8999-999999999999',
          keyword: 'Memory Agent',
          nodeId: NODE_ID,
        }),
      ];

      tenantDb.select.mockReturnValueOnce(createSelectChain(keywords));

      await expect(service.getKeywordsForNode(NODE_ID)).resolves.toEqual(
        keywords,
      );
      expect(mocks.operators.eq).toHaveBeenCalledWith(
        memoryGlossaryKeywords.nodeId,
        NODE_ID,
      );
    });
  });
});
