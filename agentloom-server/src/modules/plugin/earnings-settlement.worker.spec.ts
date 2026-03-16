import { Logger } from '@nestjs/common';
import type { DrizzleDB } from '../../database/database.module';
import { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createMockPluginUsageService,
  createMockPluginEarningsService,
  createMockDb,
  getTenantDb,
  runInTenantTransaction,
} = vi.hoisted(() => ({
  createMockPluginUsageService: () => ({
    getUsageByPluginForPeriod: vi.fn(),
  }),
  createMockPluginEarningsService: () => ({
    findExistingEarning: vi.fn(),
    createEarningsRecord: vi.fn(),
  }),
  createMockDb: () => ({
    select: vi.fn(),
  }),
  getTenantDb: vi.fn(),
  runInTenantTransaction: vi.fn(),
}));

vi.mock('../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb,
}));

vi.mock('../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction,
}));

import { EarningsSettlementWorker, type EarningsSettlementJobData } from './earnings-settlement.worker';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const PERIOD_START = '2026-02-01T00:00:00.000Z';
const PERIOD_END = '2026-02-28T23:59:59.999Z';

type MockDb = ReturnType<typeof createMockDb>;
type MockPluginUsageService = ReturnType<typeof createMockPluginUsageService>;
type MockPluginEarningsService = ReturnType<typeof createMockPluginEarningsService>;

type UsageRecord = {
  pluginDbId: string;
  pluginId: string;
  totalExecutions: number;
  totalBillingAmount: string | null;
};

type MarketplaceListingRecord = {
  id: string;
  tenantId: string;
  workflowVersionId: string | null;
  pluginDbId: string | null;
  listingType: 'plugin' | 'workflow';
  pricingModel: 'free' | 'per_execution';
  pricePerExecution: string | null;
  title: string;
  summary: string;
  tags: string[];
  coverImageUrl: string | null;
  category: 'analysis' | 'content' | 'development' | 'automation' | 'reporting' | null;
  status: 'pending_review' | 'review_failed' | 'listed' | 'unlisted';
  useCount: number;
  avgRating: string | null;
  reviewCount: number;
  reviewResult: Record<string, unknown> | null;
  submittedBy: string;
  submittedAt: Date;
  publishedAt: Date | null;
  unlistedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function createUsageRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    pluginDbId: '33333333-3333-4333-8333-333333333333',
    pluginId: 'com.example.plugin',
    totalExecutions: 10,
    totalBillingAmount: '0.00000000',
    ...overrides,
  };
}

function createMarketplaceListing(
  overrides: Partial<MarketplaceListingRecord> = {},
): MarketplaceListingRecord {
  const now = new Date('2026-03-01T00:00:00.000Z');

  return {
    id: '44444444-4444-4444-8444-444444444444',
    tenantId: TENANT_ID,
    workflowVersionId: null,
    pluginDbId: '33333333-3333-4333-8333-333333333333',
    listingType: 'plugin',
    pricingModel: 'per_execution',
    pricePerExecution: '2.50000000',
    title: 'Plugin Listing',
    summary: 'A paid plugin listing',
    tags: ['plugin'],
    coverImageUrl: null,
    category: 'development',
    status: 'listed',
    useCount: 0,
    avgRating: null,
    reviewCount: 0,
    reviewResult: null,
    submittedBy: '55555555-5555-4555-8555-555555555555',
    submittedAt: now,
    publishedAt: now,
    unlistedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createListingQuery(result: MarketplaceListingRecord[]) {
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

    getTenantDb.mockReturnValue(mockDb as unknown as DrizzleDB);
    runInTenantTransaction.mockImplementation(
      async (
        db: unknown,
        _tenantId: string,
        operation: (tenantDb: unknown) => Promise<unknown>,
      ) => operation(db),
    );

    worker = new EarningsSettlementWorker(
      mockDb as unknown as DrizzleDB,
      mockUsageService,
      mockEarningsService,
    );
  });

  describe('process', () => {
    it('should settle earnings for paid plugins', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      const usage = createUsageRecord();
      const listingQuery = createListingQuery([createMarketplaceListing()]);

      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([usage]);
      mockEarningsService.findExistingEarning.mockResolvedValue(null);
      mockEarningsService.createEarningsRecord.mockResolvedValue({ id: 'earning-1' });
      mockDb.select.mockReturnValueOnce(listingQuery.chain);

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
      expect(mockEarningsService.createEarningsRecord).toHaveBeenCalledTimes(1);
      expect(mockEarningsService.createEarningsRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginDbId: usage.pluginDbId,
          pluginId: usage.pluginId,
          orgId: ORG_ID,
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
            pricingModel: 'per_execution',
            pricePerExecution: '2.50000000',
            totalBillingAmount: usage.totalBillingAmount,
          },
        }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        `Settled earnings for 1 plugins in ${ORG_ID}`,
      );
    });

    it('should skip free plugins', async () => {
      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([
        createUsageRecord(),
      ]);
      mockEarningsService.findExistingEarning.mockResolvedValue(null);
      mockDb.select.mockReturnValueOnce(
        createListingQuery([
          createMarketplaceListing({ pricingModel: 'free', pricePerExecution: null }),
        ]).chain,
      );

      await worker.process(createJob());

      expect(mockEarningsService.createEarningsRecord).not.toHaveBeenCalled();
    });

    it('should skip plugins without marketplace listing', async () => {
      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([
        createUsageRecord(),
      ]);
      mockEarningsService.findExistingEarning.mockResolvedValue(null);
      mockDb.select.mockReturnValueOnce(createListingQuery([]).chain);

      await worker.process(createJob());

      expect(mockEarningsService.createEarningsRecord).not.toHaveBeenCalled();
    });

    it('should skip if earnings record already exists (idempotency)', async () => {
      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([
        createUsageRecord(),
      ]);
      mockEarningsService.findExistingEarning.mockResolvedValue({
        id: 'existing-earning',
      });

      await worker.process(createJob());

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockEarningsService.createEarningsRecord).not.toHaveBeenCalled();
    });

    it('should calculate revenue split correctly', async () => {
      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([
        createUsageRecord({ totalExecutions: 3 }),
      ]);
      mockEarningsService.findExistingEarning.mockResolvedValue(null);
      mockDb.select.mockReturnValueOnce(
        createListingQuery([
          createMarketplaceListing({ pricePerExecution: '1.00000000' }),
        ]).chain,
      );

      await worker.process(createJob());

      expect(mockEarningsService.createEarningsRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          totalRevenue: '3.00000000',
          developerShare: '1.78500000',
          platformShare: '0.90000000',
          listingCommission: '0.31500000',
        }),
      );
    });

    it('should handle empty usage data', async () => {
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

    it('should handle multiple plugins in one settlement', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      const firstUsage = createUsageRecord({
        pluginDbId: '66666666-6666-4666-8666-666666666666',
        pluginId: 'com.example.first',
        totalExecutions: 4,
      });
      const secondUsage = createUsageRecord({
        pluginDbId: '77777777-7777-4777-8777-777777777777',
        pluginId: 'com.example.second',
        totalExecutions: 2,
      });

      mockUsageService.getUsageByPluginForPeriod.mockResolvedValue([
        firstUsage,
        secondUsage,
      ]);
      mockEarningsService.findExistingEarning.mockResolvedValue(null);
      mockDb.select
        .mockReturnValueOnce(
          createListingQuery([
            createMarketplaceListing({
              pluginDbId: firstUsage.pluginDbId,
              pricePerExecution: '1.50000000',
            }),
          ]).chain,
        )
        .mockReturnValueOnce(
          createListingQuery([
            createMarketplaceListing({
              pluginDbId: secondUsage.pluginDbId,
              pricePerExecution: '2.00000000',
            }),
          ]).chain,
        );

      await worker.process(createJob());

      expect(mockEarningsService.createEarningsRecord).toHaveBeenCalledTimes(2);
      expect(logSpy).toHaveBeenCalledWith(
        `Settled earnings for 2 plugins in ${ORG_ID}`,
      );
    });
  });

  describe('onFailed', () => {
    it('should log error on failure', () => {
      const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const error = new Error('settlement failed');

      expect(() => worker.onFailed(createJob(), error)).not.toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const message = errorSpy.mock.calls[0][0] as string;
      expect(message).toContain('settlement failed');
      expect(message).toContain(ORG_ID);
      expect(message).toContain(PERIOD_START);
      expect(message).toContain(PERIOD_END);
    });
  });
});
