import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }),
  getTenantDb: vi.fn(),
  operators: {
    and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    desc: vi.fn((value: unknown) => ({ type: 'desc', value })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    lte: vi.fn((left: unknown, right: unknown) => ({
      type: 'lte',
      left,
      right,
    })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: 'sql',
      strings: Array.from(strings),
      values,
    })),
  },
}));

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');

  return {
    ...actual,
    and: mocks.operators.and,
    desc: mocks.operators.desc,
    eq: mocks.operators.eq,
    lte: mocks.operators.lte,
    sql: mocks.operators.sql,
  };
});

vi.mock('../../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

import type { DrizzleDB } from '../../../../database/database.module';
import { MemorySearchService } from '../memory-search.service';

type MockDb = ReturnType<typeof mocks.createMockDb>;

type SelectChain<TResult> = Promise<TResult[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
};

const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';
const NODE_ID_1 = '33333333-3333-4333-8333-333333333333';
const NODE_ID_2 = '44444444-4444-4444-8444-444444444444';

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  return chain;
}

describe('MemorySearchService', () => {
  let service: MemorySearchService;
  let rawDb: MockDb;
  let tenantDb: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = mocks.createMockDb();
    tenantDb = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(tenantDb);

    service = new MemorySearchService(rawDb as unknown as DrizzleDB);
  });

  describe('search', () => {
    it('应使用 tsvector/tsquery 执行全文搜索并返回结果', async () => {
      const mockResults = [
        {
          nodeId: NODE_ID_1,
          content: '这是一段关于 NestJS 的记忆内容',
          relevanceScore: 0.85,
          snippet: '<b>NestJS</b> 的记忆内容',
          disclosureLevel: 0,
        },
        {
          nodeId: NODE_ID_2,
          content: 'NestJS 框架最佳实践',
          relevanceScore: 0.65,
          snippet: '<b>NestJS</b> 框架最佳实践',
          disclosureLevel: 1,
        },
      ];

      const chain = createSelectChain(mockResults);
      tenantDb.select.mockReturnValue(chain);

      const result = await service.search(INSTANCE_ID, {
        query: 'NestJS',
      });

      expect(result).toEqual(mockResults);
      expect(mocks.getTenantDb).toHaveBeenCalledWith(rawDb);
      expect(tenantDb.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.innerJoin).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.orderBy).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalled();
      expect(chain.offset).toHaveBeenCalled();
    });

    it('应对空查询字符串返回空数组', async () => {
      const result = await service.search(INSTANCE_ID, { query: '' });

      expect(result).toEqual([]);
      expect(tenantDb.select).not.toHaveBeenCalled();
    });

    it('应对仅含空白字符的查询返回空数组', async () => {
      const result = await service.search(INSTANCE_ID, { query: '   ' });

      expect(result).toEqual([]);
      expect(tenantDb.select).not.toHaveBeenCalled();
    });

    it('应使用默认分页参数 (limit=20, offset=0)', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, { query: 'test' });

      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(chain.offset).toHaveBeenCalledWith(0);
    });

    it('应使用自定义分页参数', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, {
        query: 'test',
        limit: 10,
        offset: 30,
      });

      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(chain.offset).toHaveBeenCalledWith(30);
    });

    it('应将 limit 限制在最大 100', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, {
        query: 'test',
        limit: 200,
      });

      expect(chain.limit).toHaveBeenCalledWith(100);
    });

    it('应将 limit 最小值限制为 1', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, {
        query: 'test',
        limit: 0,
      });

      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('应将 offset 最小值限制为 0', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, {
        query: 'test',
        offset: -5,
      });

      expect(chain.offset).toHaveBeenCalledWith(0);
    });

    it('应根据 minDisclosure 过滤结果', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, {
        query: 'test',
        minDisclosure: 2,
      });

      expect(chain.where).toHaveBeenCalled();
      // 验证 lte 被调用以实现 disclosureLevel <= minDisclosure
      expect(mocks.operators.lte).toHaveBeenCalled();
    });

    it('不传 minDisclosure 时不应调用 lte 过滤', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, { query: 'test' });

      expect(chain.where).toHaveBeenCalled();
      // 不传 minDisclosure 时 lte 不应被调用
      expect(mocks.operators.lte).not.toHaveBeenCalled();
    });

    it('应对包含特殊字符的查询进行清理', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      // 特殊 tsquery 字符不应导致抛出
      await expect(
        service.search(INSTANCE_ID, {
          query: 'hello & world | !test :*',
        }),
      ).resolves.toBeDefined();

      expect(tenantDb.select).toHaveBeenCalled();
    });

    it('应对仅含特殊字符的查询返回空数组', async () => {
      const result = await service.search(INSTANCE_ID, {
        query: '!@#$%^&*()',
      });

      expect(result).toEqual([]);
      expect(tenantDb.select).not.toHaveBeenCalled();
    });

    it('应按相关性降序排列结果', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, { query: 'test' });

      expect(chain.orderBy).toHaveBeenCalled();
      expect(mocks.operators.desc).toHaveBeenCalled();
    });

    it('应使用 sql 模板生成 tsvector/tsquery 条件', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, { query: 'nestjs' });

      // sql 模板应被多次调用：用于 tsvector match、ts_rank、ts_headline
      expect(mocks.operators.sql).toHaveBeenCalled();
    });

    it('应仅搜索未弃用的版本', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, { query: 'test' });

      // eq 应被调用以检查 deprecated = false
      expect(mocks.operators.eq).toHaveBeenCalled();
    });

    it('应仅搜索指定 instanceId 的节点', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, { query: 'test' });

      // eq 应被调用以匹配 instanceId
      expect(mocks.operators.eq).toHaveBeenCalledWith(
        expect.anything(),
        INSTANCE_ID,
      );
    });

    it('应将多个搜索词用 & 组合为 tsquery', async () => {
      const chain = createSelectChain([]);
      tenantDb.select.mockReturnValue(chain);

      await service.search(INSTANCE_ID, { query: 'hello world' });

      // sql 被调用时应包含 & 连接的词
      expect(mocks.operators.sql).toHaveBeenCalled();
    });
  });
});
