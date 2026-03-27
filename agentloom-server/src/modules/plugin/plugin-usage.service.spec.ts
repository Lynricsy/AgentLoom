import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMockDb, getTenantDbMock, drizzleOperators } = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
  }),
  getTenantDbMock: vi.fn(),
  drizzleOperators: {
    and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    gte: vi.fn((left: unknown, right: unknown) => ({ op: 'gte', left, right })),
    lte: vi.fn((left: unknown, right: unknown) => ({ op: 'lte', left, right })),
    desc: vi.fn((value: unknown) => ({ op: 'desc', value })),
    count: vi.fn(() => ({ op: 'count' })),
    sum: vi.fn((value: unknown) => ({ op: 'sum', value })),
    avg: vi.fn((value: unknown) => ({ op: 'avg', value })),
  },
}));

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');

  return {
    ...actual,
    and: drizzleOperators.and,
    eq: drizzleOperators.eq,
    gte: drizzleOperators.gte,
    lte: drizzleOperators.lte,
    desc: drizzleOperators.desc,
    count: drizzleOperators.count,
    sum: drizzleOperators.sum,
    avg: drizzleOperators.avg,
  };
});

vi.mock('../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: getTenantDbMock,
}));

import type { DrizzleDB } from '../../database/database.module';
import {
  pluginUsageRecords,
  type NewPluginUsageRecord,
  type PluginUsageRecord,
} from '../../database/schema';
import {
  QueryPluginUsageSchema,
  type QueryPluginUsageQueryDtoType,
} from './dto/plugin-usage-query.dto';
import { PluginUsageService } from './plugin-usage.service';

type MockDb = ReturnType<typeof createMockDb>;

type QueryInput = Partial<{
  pluginId: string;
  executionId: string;
  startDate: string | Date;
  endDate: string | Date;
  page: number | string;
  pageSize: number | string;
}>;

type SelectChain<TResult> = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
} & Promise<TResult[]>;

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const PLUGIN_DB_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PLUGIN_DB_ID = '44444444-4444-4444-8444-444444444444';
const PLUGIN_ID = 'com.example.demo';
const OTHER_PLUGIN_ID = 'com.example.other';
const EXECUTION_ID = '55555555-5555-4555-8555-555555555555';
const STEP_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = '77777777-7777-4777-8777-777777777777';
const NOW = new Date('2025-01-10T10:00:00.000Z');
const SOURCE_TENANT_ID = '88888888-8888-4888-8888-888888888888';
const SOURCE_ORG_ID = '99999999-9999-4999-8999-999999999999';
const SOURCE_PLUGIN_DB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOURCE_PLUGIN_ID = 'com.example.publisher';
const SOURCE_LISTING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
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

function createUsageRecord(
  overrides: Partial<PluginUsageRecord> = {},
): PluginUsageRecord {
  return {
    id: '88888888-8888-4888-8888-888888888888',
    tenantId: TENANT_ID,
    pluginDbId: PLUGIN_DB_ID,
    pluginId: PLUGIN_ID,
    executionId: EXECUTION_ID,
    stepId: STEP_ID,
    executedBy: USER_ID,
    sourceTenantId: SOURCE_TENANT_ID,
    sourceOrgId: SOURCE_ORG_ID,
    sourcePluginDbId: SOURCE_PLUGIN_DB_ID,
    sourcePluginId: SOURCE_PLUGIN_ID,
    sourceListingId: SOURCE_LISTING_ID,
    billingAmount: '12.50000000',
    currency: 'USD',
    executionDurationMs: '250',
    inputTokens: '128',
    outputTokens: '64',
    metadata: { source: 'unit-test' },
    createdAt: NOW,
    ...overrides,
  };
}

function createNewUsageRecord(
  overrides: Partial<NewPluginUsageRecord> = {},
): NewPluginUsageRecord {
  const record = createUsageRecord();

  return {
    tenantId: record.tenantId,
    pluginDbId: record.pluginDbId,
    pluginId: record.pluginId,
    executionId: record.executionId,
    stepId: record.stepId,
    executedBy: record.executedBy,
    sourceTenantId: record.sourceTenantId,
    sourceOrgId: record.sourceOrgId,
    sourcePluginDbId: record.sourcePluginDbId,
    sourcePluginId: record.sourcePluginId,
    sourceListingId: record.sourceListingId,
    billingAmount: record.billingAmount,
    currency: record.currency,
    executionDurationMs: record.executionDurationMs,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    metadata: record.metadata,
    createdAt: record.createdAt,
    ...overrides,
  };
}

function createQuery(overrides: QueryInput = {}): QueryPluginUsageQueryDtoType {
  return QueryPluginUsageSchema.parse(overrides);
}

describe('PluginUsageService', () => {
  let service: PluginUsageService;
  let db: MockDb;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    db = createMockDb();
    getTenantDbMock.mockReturnValue(db as unknown as DrizzleDB);
    service = new PluginUsageService(db as unknown as DrizzleDB);
  });

  describe('recordUsage', () => {
    it('应写入并返回插件使用记录', async () => {
      const created = createUsageRecord();
      const payload = createNewUsageRecord();
      const insertQuery = createInsertChain([created]);

      db.insert.mockReturnValueOnce(insertQuery.chain);

      await expect(service.recordUsage(payload)).resolves.toEqual(created);

      expect(db.insert).toHaveBeenCalledWith(pluginUsageRecords);
      expect(insertQuery.values).toHaveBeenCalledWith(payload);
      expect(insertQuery.returning).toHaveBeenCalledTimes(1);
    });
  });

  describe('findUsageByPlugin', () => {
    it('无过滤条件时应返回默认分页结果', async () => {
      const record = createUsageRecord();
      const dataQuery = createSelectChain([record]);
      const countQuery = createSelectChain([{ total: 1 }]);

      db.select.mockReturnValueOnce(dataQuery).mockReturnValueOnce(countQuery);

      const result = await service.findUsageByPlugin(
        PLUGIN_DB_ID,
        createQuery(),
      );

      expect(result).toEqual({
        data: [record],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      });
      expect(drizzleOperators.eq).toHaveBeenCalledWith(
        pluginUsageRecords.pluginDbId,
        PLUGIN_DB_ID,
      );
      expect(drizzleOperators.desc).toHaveBeenCalledWith(
        pluginUsageRecords.createdAt,
      );
      expect(dataQuery.limit).toHaveBeenCalledWith(20);
      expect(dataQuery.offset).toHaveBeenCalledWith(0);
    });

    it('应支持按日期范围过滤', async () => {
      const startDate = '2025-01-01T00:00:00.000Z';
      const endDate = '2025-01-31T23:59:59.999Z';
      const dataQuery = createSelectChain<PluginUsageRecord>([]);
      const countQuery = createSelectChain([{ total: 0 }]);

      db.select.mockReturnValueOnce(dataQuery).mockReturnValueOnce(countQuery);

      const result = await service.findUsageByPlugin(
        PLUGIN_DB_ID,
        createQuery({ startDate, endDate }),
      );

      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      });
      expect(drizzleOperators.gte).toHaveBeenCalledWith(
        pluginUsageRecords.createdAt,
        new Date(startDate),
      );
      expect(drizzleOperators.lte).toHaveBeenCalledWith(
        pluginUsageRecords.createdAt,
        new Date(endDate),
      );
      expect(drizzleOperators.and).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'eq' }),
        expect.objectContaining({ op: 'gte' }),
        expect.objectContaining({ op: 'lte' }),
      );
    });

    it('应支持 pluginId 与 executionId 过滤并正确计算分页', async () => {
      const record = createUsageRecord({
        executionId: '99999999-9999-4999-8999-999999999999',
      });
      const dataQuery = createSelectChain([record]);
      const countQuery = createSelectChain([{ total: 11 }]);

      db.select.mockReturnValueOnce(dataQuery).mockReturnValueOnce(countQuery);

      const result = await service.findUsageByPlugin(
        PLUGIN_DB_ID,
        createQuery({
          pluginId: PLUGIN_ID,
          executionId: record.executionId,
          page: 2,
          pageSize: 5,
        }),
      );

      expect(result.meta).toEqual({
        page: 2,
        pageSize: 5,
        total: 11,
        totalPages: 3,
      });
      expect(drizzleOperators.eq).toHaveBeenCalledWith(
        pluginUsageRecords.pluginId,
        PLUGIN_ID,
      );
      expect(drizzleOperators.eq).toHaveBeenCalledWith(
        pluginUsageRecords.executionId,
        record.executionId,
      );
      expect(dataQuery.limit).toHaveBeenCalledWith(5);
      expect(dataQuery.offset).toHaveBeenCalledWith(5);
    });
  });

  describe('getUsageSummary', () => {
    it('应返回聚合统计结果', async () => {
      const start = new Date('2025-01-01T00:00:00.000Z');
      const end = new Date('2025-01-31T23:59:59.999Z');
      const summaryQuery = createSelectChain([
        {
          totalExecutions: 3,
          totalBillingAmount: '42.42000000',
          avgDurationMs: '240',
        },
      ]);

      db.select.mockReturnValueOnce(summaryQuery);

      await expect(
        service.getUsageSummary(PLUGIN_DB_ID, start, end),
      ).resolves.toEqual({
        totalExecutions: 3,
        totalBillingAmount: '42.42000000',
        avgDurationMs: 240,
      });

      expect(drizzleOperators.count).toHaveBeenCalledTimes(1);
      expect(drizzleOperators.sum).toHaveBeenCalledWith(
        pluginUsageRecords.billingAmount,
      );
      expect(drizzleOperators.avg).toHaveBeenCalledWith(
        pluginUsageRecords.executionDurationMs,
      );
      expect(drizzleOperators.gte).toHaveBeenCalledWith(
        pluginUsageRecords.createdAt,
        start,
      );
      expect(drizzleOperators.lte).toHaveBeenCalledWith(
        pluginUsageRecords.createdAt,
        end,
      );
    });

    it('应处理零值与空聚合结果', async () => {
      const summaryQuery = createSelectChain([
        {
          totalExecutions: 0,
          totalBillingAmount: null,
          avgDurationMs: null,
        },
      ]);

      db.select.mockReturnValueOnce(summaryQuery);

      await expect(
        service.getUsageSummary(
          PLUGIN_DB_ID,
          new Date('2025-02-01T00:00:00.000Z'),
          new Date('2025-02-28T23:59:59.999Z'),
        ),
      ).resolves.toEqual({
        totalExecutions: 0,
        totalBillingAmount: null,
        avgDurationMs: null,
      });
    });
  });

  describe('getUsageByPluginForPeriod', () => {
    it('应返回按插件分组的结算统计', async () => {
      const groupedQuery = createSelectChain([
        {
          tenantId: SOURCE_TENANT_ID,
          orgId: ORG_ID,
          pluginDbId: SOURCE_PLUGIN_DB_ID,
          pluginId: SOURCE_PLUGIN_ID,
          sourceListingId: SOURCE_LISTING_ID,
          currency: 'USD',
          totalExecutions: 2,
          totalBillingAmount: '19.99000000',
        },
        {
          tenantId: SOURCE_TENANT_ID,
          orgId: ORG_ID,
          pluginDbId: OTHER_PLUGIN_DB_ID,
          pluginId: OTHER_PLUGIN_ID,
          sourceListingId: null,
          currency: 'USD',
          totalExecutions: 1,
          totalBillingAmount: '0.00000000',
        },
      ]);

      db.select.mockReturnValueOnce(groupedQuery);

      const result = await service.getUsageByPluginForPeriod(
        ORG_ID,
        new Date('2025-01-01T00:00:00.000Z'),
        new Date('2025-01-31T23:59:59.999Z'),
      );

      expect(result).toEqual([
        {
          tenantId: SOURCE_TENANT_ID,
          orgId: ORG_ID,
          pluginDbId: SOURCE_PLUGIN_DB_ID,
          pluginId: SOURCE_PLUGIN_ID,
          sourceListingId: SOURCE_LISTING_ID,
          currency: 'USD',
          totalExecutions: 2,
          totalBillingAmount: '19.99000000',
        },
        {
          tenantId: SOURCE_TENANT_ID,
          orgId: ORG_ID,
          pluginDbId: OTHER_PLUGIN_DB_ID,
          pluginId: OTHER_PLUGIN_ID,
          sourceListingId: null,
          currency: 'USD',
          totalExecutions: 1,
          totalBillingAmount: '0.00000000',
        },
      ]);
      expect(drizzleOperators.eq).toHaveBeenCalledWith(
        pluginUsageRecords.sourceOrgId,
        ORG_ID,
      );
      expect(groupedQuery.groupBy).toHaveBeenCalledWith(
        pluginUsageRecords.sourceTenantId,
        pluginUsageRecords.sourceOrgId,
        pluginUsageRecords.sourcePluginDbId,
        pluginUsageRecords.sourcePluginId,
        pluginUsageRecords.sourceListingId,
      );
    });

    it('无数据时应返回空数组', async () => {
      const groupedQuery = createSelectChain<{
        pluginDbId: string;
        pluginId: string;
        totalExecutions: number;
        totalBillingAmount: string | null;
      }>([]);

      db.select.mockReturnValueOnce(groupedQuery);

      await expect(
        service.getUsageByPluginForPeriod(
          ORG_ID,
          new Date('2025-03-01T00:00:00.000Z'),
          new Date('2025-03-31T23:59:59.999Z'),
        ),
      ).resolves.toEqual([]);
    });
  });
});
