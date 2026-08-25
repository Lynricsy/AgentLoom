import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { Job } from 'bullmq';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import { FixedScaleDecimal } from './fixed-scale-decimal';
import { PluginEarningsService } from './plugin-earnings.service';
import { PluginEarningsSettlementProducer } from './plugin-earnings-settlement.producer';
import { PluginUsageService } from './plugin-usage.service';
import {
  EARNINGS_SETTLEMENT_DISPATCH_JOB_NAME,
  EARNINGS_SETTLEMENT_QUEUE,
} from './plugin.constants';

export interface EarningsSettlementJobData {
  tenantId: string;
  orgId: string;
  periodStart: string;
  periodEnd: string;
}

type UsageByPluginForPeriod = Awaited<
  ReturnType<PluginUsageService['getUsageByPluginForPeriod']>
>[number];

type SettlementAggregate = {
  tenantId: string;
  orgId: string;
  pluginDbId: string;
  pluginId: string;
  currency: string;
  totalExecutions: number;
  totalBillingAmount: FixedScaleDecimal;
  sourceListingIds: Set<string>;
};

@Processor(EARNINGS_SETTLEMENT_QUEUE)
export class EarningsSettlementWorker extends WorkerHost {
  private readonly logger = new Logger(EarningsSettlementWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly pluginUsageService: PluginUsageService,
    private readonly pluginEarningsService: PluginEarningsService,
    private readonly settlementProducer: PluginEarningsSettlementProducer,
  ) {
    super();
  }

  async process(job: Job<EarningsSettlementJobData>): Promise<void> {
    if (job.name === EARNINGS_SETTLEMENT_DISPATCH_JOB_NAME) {
      await this.dispatchSettlements(new Date());
      return;
    }

    const { tenantId, orgId, periodStart, periodEnd } = job.data;
    const periodStartDate = new Date(periodStart);
    const periodEndDate = new Date(periodEnd);

    await runInTenantTransaction(this.db, tenantId, async () => {
      const usageByPlugin =
        await this.pluginUsageService.getUsageByPluginForPeriod(
          orgId,
          periodStartDate,
          periodEndDate,
        );

      const usageAggregates = this.aggregateUsage(usageByPlugin);
      let settledCount = 0;

      for (const usage of usageAggregates) {
        if (usage.totalBillingAmount.isZero()) {
          continue;
        }

        const existingRecord =
          await this.pluginEarningsService.findExistingEarning(
            usage.pluginDbId,
            periodStartDate,
            periodEndDate,
          );

        if (existingRecord) {
          continue;
        }

        const listingIds = Array.from(usage.sourceListingIds);
        const validSourceListingIds = await this.filterPluginListingIds(
          listingIds,
          usage.pluginDbId,
        );
        const sourceListingId =
          validSourceListingIds.length === 1
            ? validSourceListingIds[0]
            : undefined;

        const amounts = this.pluginEarningsService.calculateSettlementShares(
          usage.totalBillingAmount,
        );

        await this.pluginEarningsService.createEarningsRecord({
          pluginDbId: usage.pluginDbId,
          pluginId: usage.pluginId,
          orgId: usage.orgId,
          sourceTenantId: usage.tenantId,
          sourceOrgId: usage.orgId,
          sourcePluginDbId: usage.pluginDbId,
          sourcePluginId: usage.pluginId,
          ...(sourceListingId ? { sourceListingId } : {}),
          periodStart,
          periodEnd,
          totalExecutions: usage.totalExecutions,
          totalRevenue: amounts.totalRevenue,
          developerShare: amounts.developerShare,
          platformShare: amounts.platformShare,
          listingCommission: amounts.listingCommission,
          currency: usage.currency,
          payoutStatus: 'pending',
          metadata: {
            settlementSource: 'usage_ledger',
            totalBillingAmount: usage.totalBillingAmount.toString(),
            requestedSourceListingIds: listingIds,
            filteredSourceListingIds: validSourceListingIds,
          },
        });

        settledCount += 1;
      }

      this.logger.log(
        `Settled earnings for ${settledCount} plugins in ${orgId}`,
      );
    });
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<EarningsSettlementJobData> | undefined,
    error: Error,
  ): void {
    this.logger.error(
      `Earnings settlement failed: ${JSON.stringify({
        jobId: job?.id ?? null,
        orgId: job?.data?.orgId ?? null,
        periodStart: job?.data?.periodStart ?? null,
        periodEnd: job?.data?.periodEnd ?? null,
        attempt: job?.attemptsMade ?? null,
        error: error.message,
      })}`,
    );
  }

  /**
   * 派发上一个 UTC 自然月的结算任务。
   *
   * 周期为闭区间 [periodStart, periodEnd]，与
   * `PluginUsageService.getUsageByPluginForPeriod` 的 gte/lte 语义一致。
   */
  private async dispatchSettlements(now: Date): Promise<void> {
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1,
    );

    const sources = await this.db
      .select({
        sourceTenantId: schema.pluginUsageRecords.sourceTenantId,
        sourceOrgId: schema.pluginUsageRecords.sourceOrgId,
      })
      .from(schema.pluginUsageRecords)
      .where(
        and(
          isNotNull(schema.pluginUsageRecords.billingAmount),
          isNotNull(schema.pluginUsageRecords.sourceTenantId),
          isNotNull(schema.pluginUsageRecords.sourceOrgId),
          gte(schema.pluginUsageRecords.createdAt, periodStart),
          lte(schema.pluginUsageRecords.createdAt, periodEnd),
        ),
      )
      .groupBy(
        schema.pluginUsageRecords.sourceTenantId,
        schema.pluginUsageRecords.sourceOrgId,
      );

    const periodStartIso = periodStart.toISOString();
    const periodEndIso = periodEnd.toISOString();
    let dispatchedCount = 0;

    for (const source of sources) {
      if (!source.sourceTenantId || !source.sourceOrgId) {
        continue;
      }

      await this.settlementProducer.addSettlementJob({
        tenantId: source.sourceTenantId,
        orgId: source.sourceOrgId,
        periodStart: periodStartIso,
        periodEnd: periodEndIso,
      });

      dispatchedCount += 1;
    }

    this.logger.log(
      JSON.stringify({
        action: 'plugin_earnings_settlement_dispatched',
        periodStart: periodStartIso,
        periodEnd: periodEndIso,
        dispatchedCount,
      }),
    );
  }

  private aggregateUsage(
    usageByPlugin: UsageByPluginForPeriod[],
  ): SettlementAggregate[] {
    const aggregateMap = new Map<string, SettlementAggregate>();

    for (const usage of usageByPlugin) {
      if (
        !usage.tenantId ||
        !usage.orgId ||
        !usage.pluginDbId ||
        !usage.pluginId
      ) {
        continue;
      }

      const aggregateKey = [
        usage.tenantId,
        usage.orgId,
        usage.pluginDbId,
        usage.pluginId,
        usage.currency,
      ].join(':');

      const existingAggregate = aggregateMap.get(aggregateKey);
      const totalBillingAmount = FixedScaleDecimal.from(
        usage.totalBillingAmount,
      );

      if (existingAggregate) {
        existingAggregate.totalExecutions += usage.totalExecutions;
        existingAggregate.totalBillingAmount =
          existingAggregate.totalBillingAmount.add(totalBillingAmount);

        if (usage.sourceListingId) {
          existingAggregate.sourceListingIds.add(usage.sourceListingId);
        }

        continue;
      }

      aggregateMap.set(aggregateKey, {
        tenantId: usage.tenantId,
        orgId: usage.orgId,
        pluginDbId: usage.pluginDbId,
        pluginId: usage.pluginId,
        currency: usage.currency || 'USD',
        totalExecutions: usage.totalExecutions,
        totalBillingAmount,
        sourceListingIds: new Set(
          usage.sourceListingId ? [usage.sourceListingId] : [],
        ),
      });
    }

    return Array.from(aggregateMap.values());
  }

  private async filterPluginListingIds(
    listingIds: string[],
    pluginDbId: string,
  ): Promise<string[]> {
    if (listingIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select({ id: schema.marketplaceListings.id })
      .from(schema.marketplaceListings)
      .where(
        and(
          inArray(schema.marketplaceListings.id, listingIds),
          eq(schema.marketplaceListings.pluginDbId, pluginDbId),
          eq(schema.marketplaceListings.listingType, 'plugin'),
        ),
      );

    return rows.map((row) => row.id);
  }
}
