import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../database/database.module';
import { pluginEarnings, type PluginEarning } from '../../database/schema';
import {
  CreateEarningsRecordSchema,
  QueryPluginEarningsSchema,
  UpdatePayoutStatusSchema,
  type CreateEarningsRecordDtoType,
  type QueryPluginEarningsDtoType,
  type UpdatePayoutStatusDtoType,
} from './dto/plugin-earnings.dto';
import { PluginEarningsService } from './plugin-earnings.service';

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
const EARNING_ID = '44444444-4444-4444-8444-444444444444';

type MockDb = ReturnType<typeof createMockDb>;

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

function createQuery(
  overrides: Partial<QueryPluginEarningsDtoType> = {},
): QueryPluginEarningsDtoType {
  return QueryPluginEarningsSchema.parse(overrides);
}

function createCreatePayload(
  overrides: Partial<CreateEarningsRecordDtoType> = {},
): CreateEarningsRecordDtoType {
  return CreateEarningsRecordSchema.parse({
    pluginDbId: PLUGIN_DB_ID,
    pluginId: 'com.example.plugin',
    orgId: ORG_ID,
    periodStart: '2025-01-01T00:00:00.000Z',
    periodEnd: '2025-01-31T23:59:59.000Z',
    totalExecutions: 120,
    totalRevenue: '100.50000000',
    developerShare: '70.35000000',
    platformShare: '30.15000000',
    listingCommission: '10.55250000',
    metadata: { source: 'settlement' },
    ...overrides,
  });
}

function createUpdatePayload(
  overrides: Partial<UpdatePayoutStatusDtoType> = {},
): UpdatePayoutStatusDtoType {
  return UpdatePayoutStatusSchema.parse({
    payoutStatus: 'processing',
    ...overrides,
  });
}

function createSelectChain<TResult>(result: TResult[]) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });

  return {
    chain: { from },
    from,
    where,
  };
}

function createSelectChainWithLimit<TResult>(result: TResult[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });

  return {
    chain: { from },
    from,
    where,
    limit,
  };
}

function createSelectChainWithPagination<TResult>(result: TResult[]) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });

  return {
    chain: { from },
    from,
    where,
    orderBy,
    limit,
    offset,
  };
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
    it('应创建收益记录并返回插入结果', async () => {
      const pluginQuery = createSelectChainWithLimit([{ tenantId: TENANT_ID }]);
      const created = createEarningRecord();
      const insertQuery = createInsertChain([created]);
      const payload = createCreatePayload();

      db.select.mockReturnValueOnce(pluginQuery.chain);
      db.insert.mockReturnValueOnce(insertQuery.chain);

      const result = await service.createEarningsRecord(payload);

      expect(result).toEqual(created);
      expect(pluginQuery.limit).toHaveBeenCalledWith(1);
      expect(db.insert).toHaveBeenCalledWith(pluginEarnings);
      expect(insertQuery.values).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        pluginDbId: PLUGIN_DB_ID,
        pluginId: 'com.example.plugin',
        orgId: ORG_ID,
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
    });
  });

  describe('findEarnings', () => {
    it('无过滤条件时应返回默认分页结果', async () => {
      const dataQuery = createSelectChainWithPagination([createEarningRecord()]);
      const countQuery = createSelectChain([{ total: 1 }]);

      db.select.mockReturnValueOnce(dataQuery.chain).mockReturnValueOnce(countQuery.chain);

      const result = await service.findEarnings(createQuery());

      expect(dataQuery.limit).toHaveBeenCalledWith(20);
      expect(dataQuery.offset).toHaveBeenCalledWith(0);
      expect(result).toEqual({
        data: [createEarningRecord()],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('应支持按 payoutStatus 过滤', async () => {
      const dataQuery = createSelectChainWithPagination([
        createEarningRecord({ payoutStatus: 'completed' }),
      ]);
      const countQuery = createSelectChain([{ total: 1 }]);

      db.select.mockReturnValueOnce(dataQuery.chain).mockReturnValueOnce(countQuery.chain);

      const result = await service.findEarnings(
        createQuery({ payoutStatus: 'completed' }),
      );

      expect(dataQuery.where.mock.calls[0][0]).toBeDefined();
      expect(countQuery.where.mock.calls[0][0]).toBeDefined();
      expect(result.data[0]?.payoutStatus).toBe('completed');
    });

    it('应支持按结算周期范围过滤', async () => {
      const dataQuery = createSelectChainWithPagination([createEarningRecord()]);
      const countQuery = createSelectChain([{ total: 1 }]);

      db.select.mockReturnValueOnce(dataQuery.chain).mockReturnValueOnce(countQuery.chain);

      await service.findEarnings(
        createQuery({
          periodStart: '2025-01-01T00:00:00.000Z',
          periodEnd: '2025-01-31T23:59:59.000Z',
        }),
      );

      expect(dataQuery.where.mock.calls[0][0]).toBeDefined();
      expect(countQuery.where.mock.calls[0][0]).toBeDefined();
    });

    it('应根据 page 与 pageSize 返回分页结果', async () => {
      const records = [createEarningRecord()];
      const dataQuery = createSelectChainWithPagination(records);
      const countQuery = createSelectChain([{ total: 11 }]);

      db.select.mockReturnValueOnce(dataQuery.chain).mockReturnValueOnce(countQuery.chain);

      const result = await service.findEarnings(
        createQuery({ page: 2, pageSize: 5 }),
      );

      expect(dataQuery.limit).toHaveBeenCalledWith(5);
      expect(dataQuery.offset).toHaveBeenCalledWith(5);
      expect(result.meta).toEqual({
        page: 2,
        pageSize: 5,
        total: 11,
        totalPages: 3,
      });
    });
  });

  describe('findEarningById', () => {
    it('存在时应返回收益记录', async () => {
      const record = createEarningRecord();
      const selectQuery = createSelectChainWithLimit([record]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.findEarningById(EARNING_ID)).resolves.toEqual(record);
      expect(selectQuery.limit).toHaveBeenCalledWith(1);
    });

    it('不存在时应抛出 NotFoundException', async () => {
      const selectQuery = createSelectChainWithLimit<PluginEarning>([]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(service.findEarningById(EARNING_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updatePayoutStatus', () => {
    it('应更新 payout 状态并返回最新记录', async () => {
      const existing = createEarningRecord();
      const selectQuery = createSelectChainWithLimit([existing]);
      const updated = createEarningRecord({
        payoutStatus: 'completed',
        payoutReference: 'payout_123',
        payoutAt: new Date('2025-02-01T00:00:00.000Z'),
      });
      const updateQuery = createUpdateChain([updated]);
      const payload = createUpdatePayload({
        payoutStatus: 'completed',
        payoutReference: 'payout_123',
        payoutAt: '2025-02-01T00:00:00.000Z',
      });

      db.select.mockReturnValueOnce(selectQuery.chain);
      db.update.mockReturnValueOnce(updateQuery.chain);

      const result = await service.updatePayoutStatus(EARNING_ID, payload);

      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalledWith(pluginEarnings);
      expect(updateQuery.set).toHaveBeenCalledWith(
        expect.objectContaining({
          payoutStatus: 'completed',
          payoutReference: 'payout_123',
          payoutAt: new Date('2025-02-01T00:00:00.000Z'),
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('记录不存在时应抛出 NotFoundException', async () => {
      const selectQuery = createSelectChainWithLimit<PluginEarning>([]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(
        service.updatePayoutStatus(EARNING_ID, createUpdatePayload()),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('getEarningsSummary', () => {
    it('应返回聚合后的收益汇总', async () => {
      const summaryQuery = createSelectChain([
        {
          totalRevenue: '100.50000000',
          totalDeveloperShare: '70.35000000',
          totalPlatformShare: '30.15000000',
          pendingPayout: '20.00000000',
          completedPayout: '50.35000000',
        },
      ]);

      db.select.mockReturnValueOnce(summaryQuery.chain);

      await expect(service.getEarningsSummary(ORG_ID)).resolves.toEqual({
        totalRevenue: '100.50000000',
        totalDeveloperShare: '70.35000000',
        totalPlatformShare: '30.15000000',
        pendingPayout: '20.00000000',
        completedPayout: '50.35000000',
      });
    });

    it('无记录时应返回全 0 汇总', async () => {
      const summaryQuery = createSelectChain<{
        totalRevenue: string;
        totalDeveloperShare: string;
        totalPlatformShare: string;
        pendingPayout: string;
        completedPayout: string;
      }>([]);

      db.select.mockReturnValueOnce(summaryQuery.chain);

      await expect(service.getEarningsSummary(ORG_ID)).resolves.toEqual({
        totalRevenue: '0',
        totalDeveloperShare: '0',
        totalPlatformShare: '0',
        pendingPayout: '0',
        completedPayout: '0',
      });
    });
  });

  describe('findExistingEarning', () => {
    it('存在同插件同周期记录时应返回该记录', async () => {
      const record = createEarningRecord();
      const selectQuery = createSelectChainWithLimit([record]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(
        service.findExistingEarning(
          PLUGIN_DB_ID,
          new Date('2025-01-01T00:00:00.000Z'),
          new Date('2025-01-31T23:59:59.000Z'),
        ),
      ).resolves.toEqual(record);
      expect(selectQuery.limit).toHaveBeenCalledWith(1);
    });

    it('不存在同插件同周期记录时应返回 null', async () => {
      const selectQuery = createSelectChainWithLimit<PluginEarning>([]);

      db.select.mockReturnValueOnce(selectQuery.chain);

      await expect(
        service.findExistingEarning(
          PLUGIN_DB_ID,
          new Date('2025-01-01T00:00:00.000Z'),
          new Date('2025-01-31T23:59:59.000Z'),
        ),
      ).resolves.toBeNull();
    });
  });
});
