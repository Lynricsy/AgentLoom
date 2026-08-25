import { Logger } from '@nestjs/common';
import type { DrizzleDB } from '../../database/database.module';
import { Job } from 'bullmq';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

const {
  createMockPluginUsageService,
  createMockPluginEarningsService,
  createMockSettlementProducer,
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
  createMockSettlementProducer: () => ({
    addSettlementJob: vi.fn().mockResolvedValue({ id: 'settlement-job' }),
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
import { EARNINGS_SETTLEMENT_DISPATCH_JOB_NAME } from './plugin.constants';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const PERIOD_START = '2026-02-01T00:00:00.000Z';
const PERIOD_END = '2026-02-28T23:59:59.999Z';
const SOURCE_LISTING_ID = '44444444-4444-4444-8444-444444444444';

type MockDb = { select: Mock };
type MockPluginUsageService = { getUsageByPluginForPeriod: Mock };
type MockSettlementProducer = { addSettlementJob: Mock };
type MockPluginEarningsService = {
  findExistingEarning: Mock;
  createEarningsRecord: Mock;
  calculateSettlementShares: Mock;
};

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
  from: Mock;
  where: Mock;
  limit: Mock;
  groupBy: Mock;
} & Promise<TResult[]>;

function createSelectChain<TResult>(result: TResult[]): SelectChain<TResult> {
  const chain = Promise.resolve(result) as SelectChain<TResult>;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
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

function createDispatchJob(): Job<EarningsSettlementJobData> {
  return {
    id: 'dispatch-job-1',
    name: EARNINGS_SETTLEMENT_DISPATCH_JOB_NAME,
    data: {},
    attemptsMade: 0,
  } as unknown as Job<EarningsSettlementJobData>;
}

describe('EarningsSettlementWorker', () => {
  let worker: EarningsSettlementWorker;
  let mockDb: MockDb;
  let mockUsageService: MockPluginUsageService;
  let mockEarningsService: MockPluginEarningsService;
  let mockSettlementProducer: MockSettlementProducer;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = createMockDb();
    mockUsageService = createMockPluginUsageService();
    mockEarningsService = createMockPluginEarningsService();
    mockSettlementProducer = createMockSettlementProducer();

    runInTenantTransaction.mockImplementation(
      async (
        db: unknown,
        _tenantId: string,
        operation: (tenantDb: unknown) => Promise<unknown>,
      ) => operation(db),
    );

    mockEarningsService.calculateSettlementShares.mockImplementation(
      (value) => ({
        totalRevenue: value.toString(),
        developerShare: '14.87500000',
        platformShare: '7.50000000',
        listingCommission: '2.62500000',
      }),
    );

    worker = new EarningsSettlementWorker(
      mockDb as unknown as DrizzleDB,
      mockUsageService as never,
      mockEarningsService as never,
      mockSettlementProducer as never,
    );
  });

  describe('process', () => {
    it('应基于 usage ledger 结算付费插件收益', async () => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});
      const usage = createUsageRecord();
      const listingQuery = createSelectChain([{ id: SOURCE_LISTING_ID }]);

      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([usage]);
      mockEarningsService.findExistingEarning.mockResolvedValue(null);
      mockEarningsService.createEarningsRecord.mockResolvedValue({
        id: 'earning-1',
      });
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
      expect(
        mockEarningsService.calculateSettlementShares,
      ).not.toHaveBeenCalled();
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
      mockEarningsService.createEarningsRecord.mockResolvedValue({
        id: 'earning-2',
      });
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
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

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

  describe('dispatch', () => {
    const SECOND_TENANT_ID = '77777777-7777-4777-8777-777777777777';
    const SECOND_ORG_ID = '88888888-8888-4888-8888-888888888888';

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-01T03:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('应按上一个 UTC 自然月为每个来源组织入队结算任务', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([
          { sourceTenantId: TENANT_ID, sourceOrgId: ORG_ID },
          { sourceTenantId: SECOND_TENANT_ID, sourceOrgId: SECOND_ORG_ID },
        ]),
      );

      await worker.process(createDispatchJob());

      expect(mockSettlementProducer.addSettlementJob).toHaveBeenCalledTimes(2);
      expect(mockSettlementProducer.addSettlementJob).toHaveBeenNthCalledWith(
        1,
        {
          tenantId: TENANT_ID,
          orgId: ORG_ID,
          periodStart: '2026-02-01T00:00:00.000Z',
          periodEnd: '2026-02-28T23:59:59.999Z',
        },
      );
      expect(mockSettlementProducer.addSettlementJob).toHaveBeenNthCalledWith(
        2,
        {
          tenantId: SECOND_TENANT_ID,
          orgId: SECOND_ORG_ID,
          periodStart: '2026-02-01T00:00:00.000Z',
          periodEnd: '2026-02-28T23:59:59.999Z',
        },
      );
      expect(mockUsageService.getUsageByPluginForPeriod).not.toHaveBeenCalled();
      expect(runInTenantTransaction).not.toHaveBeenCalled();
    });

    it('跨年时上一周期应为上一年 12 月', async () => {
      vi.setSystemTime(new Date('2026-01-01T03:00:00.000Z'));
      mockDb.select.mockReturnValueOnce(
        createSelectChain([{ sourceTenantId: TENANT_ID, sourceOrgId: ORG_ID }]),
      );

      await worker.process(createDispatchJob());

      expect(mockSettlementProducer.addSettlementJob).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        orgId: ORG_ID,
        periodStart: '2025-12-01T00:00:00.000Z',
        periodEnd: '2025-12-31T23:59:59.999Z',
      });
    });

    it('应跳过来源标识缺失的聚合行', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain([
          { sourceTenantId: null, sourceOrgId: ORG_ID },
          { sourceTenantId: TENANT_ID, sourceOrgId: null },
        ]),
      );

      await worker.process(createDispatchJob());

      expect(mockSettlementProducer.addSettlementJob).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('应记录失败日志', () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      expect(() =>
        worker.onFailed(createJob(), new Error('settlement failed')),
      ).not.toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const message = errorSpy.mock.calls[0][0] as string;
      expect(message).toContain('settlement failed');
      expect(message).toContain(ORG_ID);
      expect(message).toContain(PERIOD_START);
      expect(message).toContain(PERIOD_END);
    });

    it('job 缺失时也应安全记录失败日志', () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      expect(() =>
        worker.onFailed(undefined, new Error('missing job')),
      ).not.toThrow();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect((errorSpy.mock.calls[0]?.[0] as string) ?? '').toContain(
        'missing job',
      );
    });
  });
});
