import { Inject, Injectable } from '@nestjs/common';
import { and, avg, count, desc, eq, gte, lte, sql, sum } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  pluginUsageRecords,
  type NewPluginUsageRecord,
  type PluginUsageRecord,
} from '../../database/schema';
import {
  QueryPluginUsageSchema,
  type QueryPluginUsageQueryDtoType,
} from './dto/plugin-usage-query.dto';

type PluginUsageListResult = {
  data: PluginUsageRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type PluginUsageSummary = {
  totalExecutions: number;
  totalBillingAmount: string | null;
  avgDurationMs: number | null;
};

type PluginUsageByPluginForPeriodResult = Array<{
  tenantId: string;
  orgId: string;
  pluginDbId: string;
  pluginId: string;
  sourceListingId: string | null;
  currency: string;
  totalExecutions: number;
  totalBillingAmount: string;
}>;

@Injectable()
export class PluginUsageService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async recordUsage(data: NewPluginUsageRecord): Promise<PluginUsageRecord> {
    const [created] = await this.tenantDb
      .insert(pluginUsageRecords)
      .values(data)
      .returning();

    return created;
  }

  async findUsageByPlugin(
    pluginDbId: string,
    query: QueryPluginUsageQueryDtoType,
  ): Promise<PluginUsageListResult> {
    const parsedQuery = QueryPluginUsageSchema.parse(query);
    const page = parsedQuery.page;
    const pageSize = parsedQuery.pageSize;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(pluginUsageRecords.pluginDbId, pluginDbId)];

    if (parsedQuery.pluginId) {
      conditions.push(eq(pluginUsageRecords.pluginId, parsedQuery.pluginId));
    }

    if (parsedQuery.executionId) {
      conditions.push(
        eq(pluginUsageRecords.executionId, parsedQuery.executionId),
      );
    }

    if (parsedQuery.startDate) {
      conditions.push(gte(pluginUsageRecords.createdAt, parsedQuery.startDate));
    }

    if (parsedQuery.endDate) {
      conditions.push(lte(pluginUsageRecords.createdAt, parsedQuery.endDate));
    }

    const whereClause = and(...conditions);

    const [data, countRows] = await Promise.all([
      this.tenantDb
        .select()
        .from(pluginUsageRecords)
        .where(whereClause)
        .orderBy(desc(pluginUsageRecords.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(pluginUsageRecords)
        .where(whereClause),
    ]);

    const total = countRows[0]?.total ?? 0;

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async getUsageSummary(
    pluginDbId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PluginUsageSummary> {
    const [summary] = await this.tenantDb
      .select({
        totalExecutions: count(),
        totalBillingAmount: sum(pluginUsageRecords.billingAmount),
        avgDurationMs: avg(pluginUsageRecords.executionDurationMs),
      })
      .from(pluginUsageRecords)
      .where(
        and(
          eq(pluginUsageRecords.pluginDbId, pluginDbId),
          gte(pluginUsageRecords.createdAt, periodStart),
          lte(pluginUsageRecords.createdAt, periodEnd),
        ),
      );

    return {
      totalExecutions: Number(summary?.totalExecutions ?? 0),
      totalBillingAmount: summary?.totalBillingAmount ?? null,
      avgDurationMs:
        summary?.avgDurationMs === null || summary?.avgDurationMs === undefined
          ? null
          : Number(summary.avgDurationMs),
    };
  }

  async getUsageByPluginForPeriod(
    orgId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PluginUsageByPluginForPeriodResult> {
    const rows = await this.db
      .select({
        tenantId: pluginUsageRecords.sourceTenantId,
        orgId: pluginUsageRecords.sourceOrgId,
        pluginDbId: pluginUsageRecords.sourcePluginDbId,
        pluginId: pluginUsageRecords.sourcePluginId,
        sourceListingId: pluginUsageRecords.sourceListingId,
        currency:
          sql<string>`coalesce(max(${pluginUsageRecords.currency}), 'USD')::text`,
        totalExecutions: count(),
        totalBillingAmount:
          sql<string>`coalesce(sum(${pluginUsageRecords.billingAmount}), 0)::text`,
      })
      .from(pluginUsageRecords)
      .where(
        and(
          eq(pluginUsageRecords.sourceOrgId, orgId),
          gte(pluginUsageRecords.createdAt, periodStart),
          lte(pluginUsageRecords.createdAt, periodEnd),
        ),
      )
      .groupBy(
        pluginUsageRecords.sourceTenantId,
        pluginUsageRecords.sourceOrgId,
        pluginUsageRecords.sourcePluginDbId,
        pluginUsageRecords.sourcePluginId,
        pluginUsageRecords.sourceListingId,
      );

    return rows.map((row) => ({
      tenantId: row.tenantId ?? '',
      orgId: row.orgId ?? '',
      pluginDbId: row.pluginDbId ?? '',
      pluginId: row.pluginId ?? '',
      sourceListingId: row.sourceListingId,
      currency: row.currency,
      totalExecutions: Number(row.totalExecutions),
      totalBillingAmount: row.totalBillingAmount,
    }));
  }
}
