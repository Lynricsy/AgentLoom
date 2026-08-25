import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../database/database.module';
import { pluginEarnings, type PluginEarning } from '../../database/schema';
import {
  CreateEarningsRecordSchema,
  QueryPluginEarningsHistorySchema,
  QueryPluginEarningsSchema,
  type CreateEarningsRecordDtoType,
} from './dto/plugin-earnings.dto';
import { FixedScaleDecimal } from './fixed-scale-decimal';
import { PluginEarningsService } from './plugin-earnings.service';
import { PluginEarningsPayoutTransitionException } from './plugin.exceptions';

const { createMockDb } = vi.hoisted(() => ({
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }),
}));

const { getTenantDbMock } = vi.hoisted(() => ({
  getTenantDbMock: vi.fn(),
}));

vi.mock('../../common/providers/tenant-aware-db.provider', async () => {
  const actual = await vi.importActual<
    typeof import('../../common/providers/tenant-aware-db.provider')
  >('../../common/providers/tenant-aware-db.provider');

  return {
    ...actual,
    getTenantDb: getTenantDbMock,
  };
});

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const PLUGIN_DB_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_PLUGIN_DB_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_LISTING_ID = '55555555-5555-4555-8555-555555555555';
const EARNING_ID = '66666666-6666-4666-8666-666666666666';

type MockDb = ReturnType<typeof createMockDb>;

type SelectChain<TResult> = {
  from: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
} & Promise<TResult[]>;

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  return chain;
}

function stringifySqlChunks(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object' || !('queryChunks' in chunk)) {
    return String(chunk);
  }

  const queryChunks = (chunk as { queryChunks: unknown[] }).queryChunks;

  return queryChunks
    .map((part) => {
      if (part && typeof part === 'object') {
        if (
          'value' in part &&
          Array.isArray((part as { value?: unknown[] }).value)
        ) {
          return (part as { value: unknown[] }).value.join('');
        }
        if (
          'name' in part &&
          typeof (part as { name?: unknown }).name === 'string'
        ) {
          return (part as { name: string }).name;
        }
        if ('queryChunks' in part) {
          return stringifySqlChunks(part);
        }
      }

      return String(part);
    })
    .join('');
}

function createInsertChain<TResult>(result: TResult[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });

  return {
    chain: { values },
    values,
    onConflictDoNothing,
    returning,
  };
}

function createUpdateChain<TResult>(result: TResult[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });

  return {
    chain: { set },
    set,
    where,
    returning,
  };
}

function createEarningRecord(
  overrides: Partial<PluginEarning> = {},
): PluginEarning {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');

  return {
    id: EARNING_ID,
    tenantId: TENANT_ID,
    pluginDbId: PLUGIN_DB_ID,
    pluginId: 'com.example.plugin',
    orgId: ORG_ID,
    sourceTenantId: TENANT_ID,
    sourceOrgId: ORG_ID,
    sourcePluginDbId: SOURCE_PLUGIN_DB_ID,
    sourcePluginId: 'com.example.publisher',
    sourceListingId: SOURCE_LISTING_ID,
    periodStart: new Date('2025-01-01T00:00:00.000Z'),
    periodEnd: new Date('2025-01-31T23:59:59.000Z'),
    totalExecutions: 120,
    totalRevenue: '100.50000000',
    developerShare: '70.35000000',
    platformShare: '30.15000000',
    listingCommission: '10.55250000',
    currency: 'USD',
    payoutStatus: 'pending',
    payoutReference: null,
    payoutAt: null,
    metadata: { source: 'settlement' },
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function createEarningWithPluginName(
  pluginName: string | null = '示例插件',
  overrides: Partial<PluginEarning> = {},
) {
  return {
    ...createEarningRecord(overrides),
    pluginName,
  };
}

function createCreatePayload(
  overrides: Partial<CreateEarningsRecordDtoType> = {},
): CreateEarningsRecordDtoType {
  return CreateEarningsRecordSchema.parse({
    pluginDbId: PLUGIN_DB_ID,
    pluginId: 'com.example.plugin',
    orgId: ORG_ID,
    sourceTenantId: TENANT_ID,
    sourceOrgId: ORG_ID,
    sourcePluginDbId: SOURCE_PLUGIN_DB_ID,
    sourcePluginId: 'com.example.publisher',
    sourceListingId: SOURCE_LISTING_ID,
    periodStart: '2025-01-01T00:00:00.000Z',
    periodEnd: '2025-01-31T23:59:59.000Z',
    totalExecutions: 120,
    totalRevenue: '100.5',
    developerShare: '70.35',
    platformShare: '30.15',
    listingCommission: '10.5525',
    metadata: { source: 'settlement' },
    ...overrides,
  });
}

describe('PluginEarningsService', () => {
  let service: PluginEarningsService;
  let db: MockDb;

  beforeEach(() => {
    vi.restoreAllMocks();
    getTenantDbMock.mockReset();

    db = createMockDb();
    getTenantDbMock.mockReturnValue(db as unknown as DrizzleDB);

    service = new PluginEarningsService(db as unknown as DrizzleDB);
  });

  describe('createEarningsRecord', () => {
    it('应写入 source attribution 并使用冲突安全创建', async () => {
      const created = createEarningRecord();
      const insertQuery = createInsertChain([created]);
      const payload = createCreatePayload();

      db.insert.mockReturnValueOnce(insertQuery.chain);

      const result = await service.createEarningsRecord(payload);

      expect(result).toEqual(created);
      expect(db.insert).toHaveBeenCalledWith(pluginEarnings);
      expect(insertQuery.values).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        pluginDbId: PLUGIN_DB_ID,
        pluginId: 'com.example.plugin',
        orgId: ORG_ID,
        sourceTenantId: TENANT_ID,
        sourceOrgId: ORG_ID,
        sourcePluginDbId: SOURCE_PLUGIN_DB_ID,
        sourcePluginId: 'com.example.publisher',
        sourceListingId: SOURCE_LISTING_ID,
        periodStart: new Date('2025-01-01T00:00:00.000Z'),
        periodEnd: new Date('2025-01-31T23:59:59.000Z'),
        totalExecutions: 120,
        totalRevenue: '100.50000000',
        developerShare: '70.35000000',
        platformShare: '30.15000000',
        listingCommission: '10.55250000',
        currency: 'USD',
        payoutStatus: 'pending',
        metadata: payload.metadata,
      });
      expect(insertQuery.onConflictDoNothing).toHaveBeenCalled();
    });

    it('冲突时应回退返回已存在的收益记录', async () => {
      db.insert.mockReturnValueOnce(createInsertChain([]).chain);
      db.select.mockReturnValueOnce(createSelectChain([createEarningRecord()]));

      const result = await service.createEarningsRecord(createCreatePayload());

      expect(result).toEqual(createEarningRecord());
    });
  });

  describe('findEarnings', () => {
    it('应返回带 pluginName 的分页结果', async () => {
      const dataQuery = createSelectChain([createEarningWithPluginName()]);
      const countQuery = createSelectChain([{ total: 1 }]);

      db.select.mockReturnValueOnce(dataQuery).mockReturnValueOnce(countQuery);

      const result = await service.findEarnings(
        QueryPluginEarningsSchema.parse({ orgId: ORG_ID }),
      );

      expect(dataQuery.leftJoin).toHaveBeenCalledTimes(1);
      expect(dataQuery.limit).toHaveBeenCalledWith(20);
      expect(dataQuery.offset).toHaveBeenCalledWith(0);
      expect(result).toEqual({
        data: [createEarningWithPluginName()],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });
  });

  describe('findEarningById', () => {
    it('存在时应返回带 pluginName 的收益记录', async () => {
      const selectQuery = createSelectChain([createEarningWithPluginName()]);
      db.select.mockReturnValueOnce(selectQuery);

      await expect(service.findEarningById(EARNING_ID)).resolves.toEqual(
        createEarningWithPluginName(),
      );
      expect(selectQuery.leftJoin).toHaveBeenCalledTimes(1);
      expect(selectQuery.limit).toHaveBeenCalledWith(1);
    });

    it('不存在时应抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.findEarningById(EARNING_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updatePayoutStatus', () => {
    it('pending → processing 应写入 payoutReference 且不写 payoutAt', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([createEarningWithPluginName()]),
      );
      const updated = createEarningRecord({
        payoutStatus: 'processing',
        payoutReference: 'payout_123',
      });
      const updateQuery = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateQuery.chain);

      const result = await service.updatePayoutStatus(EARNING_ID, {
        payoutStatus: 'processing',
        payoutReference: 'payout_123',
      });

      expect(result).toEqual(updated);
      expect(updateQuery.set).toHaveBeenCalledWith({
        payoutStatus: 'processing',
        payoutReference: 'payout_123',
        updatedAt: expect.any(Date),
      });
    });

    it('processing → completed 应写入服务端当前时间', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));
      db.select.mockReturnValueOnce(
        createSelectChain([
          createEarningWithPluginName('示例插件', {
            payoutStatus: 'processing',
          }),
        ]),
      );
      const updated = createEarningRecord({ payoutStatus: 'completed' });
      const updateQuery = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateQuery.chain);

      await service.updatePayoutStatus(EARNING_ID, {
        payoutStatus: 'completed',
      });

      expect(updateQuery.set).toHaveBeenCalledWith(
        expect.objectContaining({
          payoutStatus: 'completed',
          payoutAt: new Date('2026-05-01T10:00:00.000Z'),
        }),
      );
      vi.useRealTimers();
    });

    it('客户端传入 payoutAt 应被拒绝（结算时间归服务端所有）', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          createEarningWithPluginName('示例插件', {
            payoutStatus: 'processing',
          }),
        ]),
      );

      await expect(
        service.updatePayoutStatus(EARNING_ID, {
          payoutStatus: 'completed',
          payoutAt: '2020-01-01T00:00:00.000Z',
        } as never),
      ).rejects.toThrow();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('processing → failed 应成功迁移并保持 payoutAt 为空', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          createEarningWithPluginName('示例插件', {
            payoutStatus: 'processing',
          }),
        ]),
      );
      const updated = createEarningRecord({ payoutStatus: 'failed' });
      const updateQuery = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateQuery.chain);

      await expect(
        service.updatePayoutStatus(EARNING_ID, { payoutStatus: 'failed' }),
      ).resolves.toEqual(updated);
      expect(updateQuery.set).toHaveBeenCalledWith({
        payoutStatus: 'failed',
        updatedAt: expect.any(Date),
      });
    });

    it('并发修改导致条件更新命中 0 行时应抛迁移冲突', async () => {
      db.select
        .mockReturnValueOnce(
          createSelectChain([
            createEarningWithPluginName('示例插件', {
              payoutStatus: 'processing',
            }),
          ]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            createEarningWithPluginName('示例插件', {
              payoutStatus: 'completed',
            }),
          ]),
        );
      db.update.mockReturnValueOnce(createUpdateChain([]).chain);

      await expect(
        service.updatePayoutStatus(EARNING_ID, { payoutStatus: 'failed' }),
      ).rejects.toBeInstanceOf(PluginEarningsPayoutTransitionException);
    });

    it('failed → processing 应允许重试', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          createEarningWithPluginName('示例插件', { payoutStatus: 'failed' }),
        ]),
      );
      const updated = createEarningRecord({ payoutStatus: 'processing' });
      const updateQuery = createUpdateChain([updated]);
      db.update.mockReturnValueOnce(updateQuery.chain);

      await expect(
        service.updatePayoutStatus(EARNING_ID, { payoutStatus: 'processing' }),
      ).resolves.toEqual(updated);
    });

    it('pending → completed 应拒绝跨越 processing', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([createEarningWithPluginName()]),
      );

      await expect(
        service.updatePayoutStatus(EARNING_ID, { payoutStatus: 'completed' }),
      ).rejects.toBeInstanceOf(PluginEarningsPayoutTransitionException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('completed 为终态应拒绝任何迁移', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          createEarningWithPluginName('示例插件', {
            payoutStatus: 'completed',
          }),
        ]),
      );

      await expect(
        service.updatePayoutStatus(EARNING_ID, { payoutStatus: 'processing' }),
      ).rejects.toBeInstanceOf(PluginEarningsPayoutTransitionException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('迁移到 failed 时不允许写 payoutReference', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          createEarningWithPluginName('示例插件', {
            payoutStatus: 'processing',
          }),
        ]),
      );

      await expect(
        service.updatePayoutStatus(EARNING_ID, {
          payoutStatus: 'failed',
          payoutReference: 'payout_should_be_rejected',
        }),
      ).rejects.toBeInstanceOf(PluginEarningsPayoutTransitionException);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('getEarningsSummary', () => {
    it('应返回扩展后的收益汇总字段', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          {
            totalRevenue: '100.50000000',
            totalDeveloperShare: '70.35000000',
            totalPlatformShare: '30.15000000',
            totalListingCommission: '10.55250000',
            pendingPayout: '20.00000000',
            completedPayout: '50.35000000',
            totalExecutions: 120,
            pluginCount: 3,
          },
        ]),
      );

      await expect(service.getEarningsSummary(ORG_ID)).resolves.toEqual({
        totalRevenue: '100.50000000',
        totalDeveloperShare: '70.35000000',
        totalPlatformShare: '30.15000000',
        totalListingCommission: '10.55250000',
        pendingPayout: '20.00000000',
        completedPayout: '50.35000000',
        totalExecutions: 120,
        pluginCount: 3,
      });
    });

    it('无记录时应返回全 0 汇总', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(service.getEarningsSummary(ORG_ID)).resolves.toEqual({
        totalRevenue: '0.00000000',
        totalDeveloperShare: '0.00000000',
        totalPlatformShare: '0.00000000',
        totalListingCommission: '0.00000000',
        pendingPayout: '0.00000000',
        completedPayout: '0.00000000',
        totalExecutions: 0,
        pluginCount: 0,
      });
    });
  });

  describe('dashboard queries', () => {
    it('应返回收益趋势', async () => {
      const trendQuery = createSelectChain([
        {
          bucket: '2025-01-01 00:00:00+00',
          totalRevenue: '10',
          developerShare: '5.95',
          platformShare: '3',
          listingCommission: '1.05',
          totalExecutions: 2,
        },
      ]);
      db.select.mockReturnValueOnce(trendQuery);

      await expect(
        service.getDashboardTrends({
          interval: 'day',
          periodStart: '2025-01-01T00:00:00.000Z',
          periodEnd: '2025-01-31T23:59:59.999Z',
        }),
      ).resolves.toEqual([
        {
          bucket: '2025-01-01 00:00:00+00',
          totalRevenue: '10.00000000',
          developerShare: '5.95000000',
          platformShare: '3.00000000',
          listingCommission: '1.05000000',
          totalExecutions: 2,
        },
      ]);

      expect(
        stringifySqlChunks(trendQuery.groupBy.mock.calls[0]?.[0]),
      ).toContain('1');
      expect(
        stringifySqlChunks(trendQuery.orderBy.mock.calls[0]?.[0]),
      ).toContain('1');
    });

    it('应返回收益排行', async () => {
      const rankingQuery = createSelectChain([
        {
          pluginDbId: PLUGIN_DB_ID,
          pluginId: 'com.example.plugin',
          pluginName: '示例插件',
          totalRevenue: '10',
          developerShare: '5.95',
          platformShare: '3',
          listingCommission: '1.05',
          totalExecutions: 2,
        },
      ]);
      db.select.mockReturnValueOnce(rankingQuery);

      const result = await service.getDashboardRanking({
        periodStart: '2025-01-01T00:00:00.000Z',
        periodEnd: '2025-01-31T23:59:59.999Z',
        limit: 5,
      });

      expect(rankingQuery.leftJoin).toHaveBeenCalledTimes(1);
      expect(rankingQuery.groupBy).toHaveBeenCalledTimes(1);
      expect(rankingQuery.limit).toHaveBeenCalledWith(5);
      expect(result).toEqual([
        {
          pluginDbId: PLUGIN_DB_ID,
          pluginId: 'com.example.plugin',
          pluginName: '示例插件',
          totalRevenue: '10.00000000',
          developerShare: '5.95000000',
          platformShare: '3.00000000',
          listingCommission: '1.05000000',
          totalExecutions: 2,
        },
      ]);
    });

    it('应返回收益结算历史分页结果', async () => {
      const dataQuery = createSelectChain([createEarningWithPluginName()]);
      const countQuery = createSelectChain([{ total: 1 }]);
      db.select.mockReturnValueOnce(dataQuery).mockReturnValueOnce(countQuery);

      const result = await service.getDashboardHistory(
        QueryPluginEarningsHistorySchema.parse({
          periodStart: '2025-01-01T00:00:00.000Z',
          periodEnd: '2025-01-31T23:59:59.999Z',
        }),
      );

      expect(result.data[0]?.pluginName).toBe('示例插件');
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findExistingEarning', () => {
    it('存在同插件同周期记录时应返回该记录', async () => {
      db.select.mockReturnValueOnce(createSelectChain([createEarningRecord()]));

      await expect(
        service.findExistingEarning(
          PLUGIN_DB_ID,
          new Date('2025-01-01T00:00:00.000Z'),
          new Date('2025-01-31T23:59:59.000Z'),
        ),
      ).resolves.toEqual(createEarningRecord());
    });

    it('不存在时应返回 null', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.findExistingEarning(
          PLUGIN_DB_ID,
          new Date('2025-01-01T00:00:00.000Z'),
          new Date('2025-01-31T23:59:59.000Z'),
        ),
      ).resolves.toBeNull();
    });
  });

  describe('calculateSettlementShares', () => {
    it('应使用 fixed-scale 精确计算收益分成', () => {
      expect(
        service.calculateSettlementShares(
          FixedScaleDecimal.from('25.00000000'),
        ),
      ).toEqual({
        totalRevenue: '25.00000000',
        developerShare: '14.87500000',
        platformShare: '7.50000000',
        listingCommission: '2.62500000',
      });
    });
  });
});
