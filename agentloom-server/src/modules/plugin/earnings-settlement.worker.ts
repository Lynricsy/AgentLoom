import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Job } from 'bullmq';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import { EARNINGS_SETTLEMENT_QUEUE } from './plugin.constants';

export interface EarningsSettlementJobData {
  tenantId: string;
  orgId: string;
  periodStart: string;
  periodEnd: string;
}

interface UsageByPluginForPeriod {
  pluginDbId: string;
  pluginId: string;
  totalExecutions: number;
  totalBillingAmount: string | number | null;
}

interface CreateEarningsRecordData {
  tenantId: string;
  pluginDbId: string;
  pluginId: string;
  orgId: string;
  periodStart: string;
  periodEnd: string;
  totalExecutions: number;
  totalRevenue: string;
  developerShare: string;
  platformShare: string;
  listingCommission: string;
  currency: string;
  metadata?: Record<string, unknown>;
}

interface PluginUsageService {
  getUsageByPluginForPeriod(
    orgId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UsageByPluginForPeriod[]>;
}

interface PluginEarningsService {
  findExistingEarning(
    pluginDbId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<schema.PluginEarning | null>;

  createEarningsRecord(data: CreateEarningsRecordData): Promise<unknown>;
}

const REVENUE_SPLIT = {
  DEVELOPER_SHARE: 0.7,
  PLATFORM_SHARE: 0.3,
  LISTING_COMMISSION: 0.15,
} as const;

type SettlementAmounts = {
  totalRevenue: string;
  developerShare: string;
  platformShare: string;
  listingCommission: string;
};

@Processor(EARNINGS_SETTLEMENT_QUEUE)
export class EarningsSettlementWorker extends WorkerHost {
  private readonly logger = new Logger(EarningsSettlementWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly pluginUsageService: PluginUsageService,
    private readonly pluginEarningsService: PluginEarningsService,
  ) {
    super();
  }

  async process(job: Job<EarningsSettlementJobData>): Promise<void> {
    const { tenantId, orgId, periodStart, periodEnd } = job.data;
    const periodStartDate = new Date(periodStart);
    const periodEndDate = new Date(periodEnd);

    await runInTenantTransaction(this.db, tenantId, async () => {
      const usageByPlugin = await this.pluginUsageService.getUsageByPluginForPeriod(
        orgId,
        periodStartDate,
        periodEndDate,
      );

      let settledCount = 0;

      for (const usage of usageByPlugin) {
        const existingRecord = await this.pluginEarningsService.findExistingEarning(
          usage.pluginDbId,
          periodStartDate,
          periodEndDate,
        );

        if (existingRecord) {
          continue;
        }

        const listing = await this.findListedMarketplaceEntry(usage.pluginDbId);

        if (!listing || listing.pricingModel !== 'per_execution') {
          continue;
        }

        const amounts = this.calculateSettlementAmounts(
          usage.totalExecutions,
          listing.pricePerExecution,
        );

        await this.pluginEarningsService.createEarningsRecord({
          tenantId,
          pluginDbId: usage.pluginDbId,
          pluginId: usage.pluginId,
          orgId,
          periodStart,
          periodEnd,
          totalExecutions: usage.totalExecutions,
          totalRevenue: amounts.totalRevenue,
          developerShare: amounts.developerShare,
          platformShare: amounts.platformShare,
          listingCommission: amounts.listingCommission,
          currency: 'USD',
          metadata: {
            pricingModel: listing.pricingModel,
            pricePerExecution: listing.pricePerExecution ?? '0',
            totalBillingAmount: usage.totalBillingAmount,
          },
        });

        settledCount += 1;
      }

      this.logger.log(`Settled earnings for ${settledCount} plugins in ${orgId}`);
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<EarningsSettlementJobData>, error: Error): void {
    this.logger.error(
      `Earnings settlement failed: ${JSON.stringify({
        jobId: job.id,
        orgId: job.data.orgId,
        periodStart: job.data.periodStart,
        periodEnd: job.data.periodEnd,
        attempt: job.attemptsMade,
        error: error.message,
      })}`,
    );
  }

  private async findListedMarketplaceEntry(
    pluginDbId: string,
  ): Promise<schema.MarketplaceListing | null> {
    const [listing] = await getTenantDb(this.db)
      .select()
      .from(schema.marketplaceListings)
      .where(
        and(
          eq(schema.marketplaceListings.pluginDbId, pluginDbId),
          eq(schema.marketplaceListings.status, 'listed'),
        ),
      )
      .limit(1);

    return listing ?? null;
  }

  private calculateSettlementAmounts(
    totalExecutions: number,
    pricePerExecutionValue: string | number | null,
  ): SettlementAmounts {
    const pricePerExecution = this.parseDecimal(pricePerExecutionValue);
    const totalRevenue = (totalExecutions * pricePerExecution).toFixed(8);
    const grossDevShare = (
      parseFloat(totalRevenue) * REVENUE_SPLIT.DEVELOPER_SHARE
    ).toFixed(8);
    const listingCommission = (
      parseFloat(grossDevShare) * REVENUE_SPLIT.LISTING_COMMISSION
    ).toFixed(8);
    const developerShare = (
      parseFloat(grossDevShare) - parseFloat(listingCommission)
    ).toFixed(8);
    const platformShare = (
      parseFloat(totalRevenue) * REVENUE_SPLIT.PLATFORM_SHARE
    ).toFixed(8);

    return {
      totalRevenue,
      developerShare,
      platformShare,
      listingCommission,
    };
  }

  private parseDecimal(value: string | number | null | undefined): number {
    const parsedValue = parseFloat(String(value ?? '0'));
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }
}
