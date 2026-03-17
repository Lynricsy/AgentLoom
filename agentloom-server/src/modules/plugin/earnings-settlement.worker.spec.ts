import { Logger } from '@nestjs/common';
import type { DrizzleDB } from '../../database/database.module';
import { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createMockPluginUsageService,
  createMockPluginEarningsService,
  createMockDb,
  runInTenantTransaction,
} = vi.hoisted(() => ({
  createMockPluginUsageService: () => ({
    getUsageByPluginForPeriod: vi.fn(),
  }),
  createMockPluginEarningsService: () => ({
    findExistingEarning: vi.fn(),
    createEarningsRecord: vi.fn(),
    calculateSettlementShares: vi.fn(),
  }),
  createMockDb: () => ({
    select: vi.fn(),
  }),
  runInTenantTransaction: vi.fn(),
}));

vi.mock('../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction,
}));

import {
  EarningsSettlementWorker,
  type EarningsSettlementJobData,
} from './earnings-settlement.worker';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const PERIOD_START = '2026-02-01T00:00:00.000Z';
const PERIOD_END = '2026-02-28T23:59:59.999Z';
const SOURCE_LISTING_ID = '44444444-4444-4444-8444-444444444444';

type MockDb = ReturnType<typeof createMockDb>;
type MockPluginUsageService = ReturnType<typeof createMockPluginUsageService>;
type MockPluginEarningsService = ReturnType<
  typeof createMockPluginEarningsService
>;

type UsageRecord = {
  tenantId: string;
  orgId: string;
  pluginDbId: string;
  pluginId: string;
  sourceListingId: string | null;
  currency: string;
  totalExecutions: number;
  totalBillingAmount: string;
};

function createUsageRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    tenantId: TENANT_ID,
    orgId: ORG_ID,
    pluginDbId: '33333333-3333-4333-8333-333333333333',
    pluginId: 'com.example.plugin',
    sourceListingId: SOURCE_LISTING_ID,
    currency: 'USD',
    totalExecutions: 10,
    totalBillingAmount: '25.00000000',
    ...overrides,
  };
}

type SelectChain<TResult> = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
} & Promise<TResult[]>;

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  return chain;
}

function createJob(
  overrides: Partial<EarningsSettlementJobData> = {},
): Job<EarningsSettlementJobData> {
  return {
    id: 'job-1',
    data: {
      tenantId: TENANT_ID,
      orgId: ORG_ID,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      ...overrides,
    },
    attemptsMade: 0,
  } as unknown as Job<EarningsSettlementJobData>;
}

describe('EarningsSettlementWorker', () => {
  let worker: EarningsSettlementWorker;
  let mockDb: MockDb;
  let mockUsageService: MockPluginUsageService;
  let mockEarningsService: MockPluginEarningsService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = createMockDb();
    mockUsageService = createMockPluginUsageService();
    mockEarningsService = createMockPluginEarningsService();

    runInTenantTransaction.mockImplementation(
      async (
        db: unknown,
        _tenantId: string,
        operation: (tenantDb: unknown) => Promise<unknown>,
      ) => operation(db),
    );

    mockEarningsService.calculateSettlementShares.mockImplementation((value) => ({
      totalRevenue: value.toString(),
      developerShare: '14.87500000',
      platformShare: '7.50000000',
      listingCommission: '2.62500000',
    }));

    worker = new EarningsSettlementWorker(
      mockDb as unknown as DrizzleDB,
      mockUsageService as never,
      mockEarningsService as never,
    );
  });

  describe('process', () => {
    it('应基于 usage ledger 结算付费插件收益', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      const usage = createUsageRecord();
      const listingQuery = createSelectChain([{ id: SOURCE_LISTING_ID }]);

      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([usage]);
      mockEarningsService.findExistingEarning.mockResolvedValue(null);
      mockEarningsService.createEarningsRecord.mockResolvedValue({ id: 'earning-1' });
      mockDb.select.mockReturnValueOnce(listingQuery);

      await worker.process(createJob());

      expect(runInTenantTransaction).toHaveBeenCalledWith(
        mockDb,
        TENANT_ID,
        expect.any(Function),
      );
      expect(mockUsageService.getUsageByPluginForPeriod).toHaveBeenCalledWith(
        ORG_ID,
        new Date(PERIOD_START),
        new Date(PERIOD_END),
      );
      expect(mockEarningsService.findExistingEarning).toHaveBeenCalledWith(
        usage.pluginDbId,
        new Date(PERIOD_START),
        new Date(PERIOD_END),
      );
      expect(
        mockEarningsService.calculateSettlementShares.mock.calls[0]?.[0].toString(),
      ).toBe('25.00000000');
      expect(mockEarningsService.createEarningsRecord).toHaveBeenCalledWith({
        pluginDbId: usage.pluginDbId,
        pluginId: usage.pluginId,
        orgId: ORG_ID,
        sourceTenantId: TENANT_ID,
        sourceOrgId: ORG_ID,
        sourcePluginDbId: usage.pluginDbId,
        sourcePluginId: usage.pluginId,
        sourceListingId: SOURCE_LISTING_ID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        totalExecutions: 10,
        totalRevenue: '25.00000000',
        developerShare: '14.87500000',
        platformShare: '7.50000000',
        listingCommission: '2.62500000',
        currency: 'USD',
        payoutStatus: 'pending',
        metadata: {
          settlementSource: 'usage_ledger',
          totalBillingAmount: '25.00000000',
          requestedSourceListingIds: [SOURCE_LISTING_ID],
          filteredSourceListingIds: [SOURCE_LISTING_ID],
        },
      });
      expect(logSpy).toHaveBeenCalledWith(
        `Settled earnings for 1 plugins in ${ORG_ID}`,
      );
    });

    it('应跳过 totalBillingAmount 为 0 的 usage 聚合', async () => {
      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([
        createUsageRecord({ totalBillingAmount: '0.00000000' }),
      ]);

      await worker.process(createJob());

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockEarningsService.findExistingEarning).not.toHaveBeenCalled();
      expect(mockEarningsService.createEarningsRecord).not.toHaveBeenCalled();
    });

    it('应在已有收益记录时跳过创建以保持幂等', async () => {
      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([
        createUsageRecord(),
      ]);
      mockEarningsService.findExistingEarning.mockResolvedValue({
        id: 'existing-earning',
      });

      await worker.process(createJob());

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockEarningsService.calculateSettlementShares).not.toHaveBeenCalled();
      expect(mockEarningsService.createEarningsRecord).not.toHaveBeenCalled();
    });

    it('应聚合同一 source plugin 的多条 listing usage', async () => {
      const firstListingId = '55555555-5555-4555-8555-555555555555';
      const secondListingId = '66666666-6666-4666-8666-666666666666';

      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([
        createUsageRecord({
          totalExecutions: 3,
          totalBillingAmount: '10.00000000',
          sourceListingId: firstListingId,
        }),
        createUsageRecord({
          totalExecutions: 2,
          totalBillingAmount: '5.00000000',
          sourceListingId: secondListingId,
        }),
      ]);
      mockEarningsService.findExistingEarning.mockResolvedValue(null);
      mockEarningsService.createEarningsRecord.mockResolvedValue({ id: 'earning-2' });
      mockDb.select.mockReturnValueOnce(
        createSelectChain([{ id: firstListingId }]),
      );

      await worker.process(createJob());

      expect(
        mockEarningsService.calculateSettlementShares.mock.calls[0]?.[0].toString(),
      ).toBe('15.00000000');
      expect(mockEarningsService.createEarningsRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          totalExecutions: 5,
          sourceListingId: firstListingId,
          metadata: {
            settlementSource: 'usage_ledger',
            totalBillingAmount: '15.00000000',
            requestedSourceListingIds: [firstListingId, secondListingId],
            filteredSourceListingIds: [firstListingId],
          },
        }),
      );
    });

    it('无 usage 数据时应记录 0 条结算', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([]);

      await worker.process(createJob());

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockEarningsService.findExistingEarning).not.toHaveBeenCalled();
      expect(mockEarningsService.createEarningsRecord).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        `Settled earnings for 0 plugins in ${ORG_ID}`,
      );
    });
  });

  describe('onFailed', () => {
    it('应记录失败日志', () => {
      const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      expect(() => worker.onFailed(createJob(), new Error('settlement failed'))).not.toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const message = errorSpy.mock.calls[0][0] as string;
      expect(message).toContain('settlement failed');
      expect(message).toContain(ORG_ID);
      expect(message).toContain(PERIOD_START);
      expect(message).toContain(PERIOD_END);
    });

    it('job 缺失时也应安全记录失败日志', () => {
      const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      expect(() => worker.onFailed(undefined, new Error('missing job'))).not.toThrow();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect((errorSpy.mock.calls[0]?.[0] as string) ?? '').toContain('missing job');
    });
  });
});
