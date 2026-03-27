import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  pluginEarnings,
  plugins,
  type NewPluginEarning,
  type PluginEarning,
} from '../../database/schema';
import {
  CreateEarningsRecordSchema,
  QueryPluginEarningsHistorySchema,
  QueryPluginEarningsRankingSchema,
  QueryPluginEarningsSchema,
  QueryPluginEarningsSummarySchema,
  QueryPluginEarningsTrendSchema,
  UpdatePayoutStatusSchema,
  type CreateEarningsRecordDtoType,
  type QueryPluginEarningsHistoryDtoType,
  type QueryPluginEarningsDtoType,
  type QueryPluginEarningsRankingDtoType,
  type QueryPluginEarningsSummaryDtoType,
  type QueryPluginEarningsTrendDtoType,
  type UpdatePayoutStatusDtoType,
} from './dto/plugin-earnings.dto';
import {
  FixedScaleDecimal,
  normalizeFixedScaleDecimal,
} from './fixed-scale-decimal';

export const REVENUE_SPLIT = {
  DEVELOPER_SHARE: '0.70000000',
  PLATFORM_SHARE: '0.30000000',
  LISTING_COMMISSION: '0.15000000',
} as const;

type PaginatedResult<T> = {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type PluginEarningWithPluginName = PluginEarning & {
  pluginName: string | null;
};

export type EarningsSummary = {
  totalRevenue: string;
  totalDeveloperShare: string;
  totalPlatformShare: string;
  totalListingCommission: string;
  pendingPayout: string;
  completedPayout: string;
  totalExecutions: number;
  pluginCount: number;
};

export type EarningsTrendPoint = {
  bucket: string;
  totalRevenue: string;
  developerShare: string;
  platformShare: string;
  listingCommission: string;
  totalExecutions: number;
};

export type EarningsRankingItem = {
  pluginDbId: string;
  pluginId: string;
  pluginName: string | null;
  totalRevenue: string;
  developerShare: string;
  platformShare: string;
  listingCommission: string;
  totalExecutions: number;
};

type EarningsListQuery = {
  pluginId?: string;
  orgId?: string;
  payoutStatus?: PluginEarning['payoutStatus'];
  periodStart?: string;
  periodEnd?: string;
  page: number;
  pageSize: number;
};

@Injectable()
export class PluginEarningsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async createEarningsRecord(
    data: CreateEarningsRecordDtoType,
  ): Promise<PluginEarning> {
    const parsedData = CreateEarningsRecordSchema.parse(data);
    const periodStart = new Date(parsedData.periodStart);
    const periodEnd = new Date(parsedData.periodEnd);

    const values: NewPluginEarning = {
      tenantId: parsedData.sourceTenantId,
      pluginDbId: parsedData.pluginDbId,
      pluginId: parsedData.pluginId,
      orgId: parsedData.orgId,
      sourceTenantId: parsedData.sourceTenantId,
      sourceOrgId: parsedData.sourceOrgId,
      sourcePluginDbId: parsedData.sourcePluginDbId,
      sourcePluginId: parsedData.sourcePluginId,
      sourceListingId: parsedData.sourceListingId ?? null,
      periodStart,
      periodEnd,
      totalExecutions: parsedData.totalExecutions,
      totalRevenue: normalizeFixedScaleDecimal(parsedData.totalRevenue),
      developerShare: normalizeFixedScaleDecimal(parsedData.developerShare),
      platformShare: normalizeFixedScaleDecimal(parsedData.platformShare),
      listingCommission: normalizeFixedScaleDecimal(
        parsedData.listingCommission,
      ),
      currency: parsedData.currency,
      payoutStatus: parsedData.payoutStatus,
      metadata: parsedData.metadata,
    };

    const [created] = await this.tenantDb
      .insert(pluginEarnings)
      .values(values)
      .onConflictDoNothing({
        target: [
          pluginEarnings.pluginDbId,
          pluginEarnings.periodStart,
          pluginEarnings.periodEnd,
        ],
      })
      .returning();

    if (created) {
      return created;
    }

    const existing = await this.findExistingEarning(
      parsedData.pluginDbId,
      periodStart,
      periodEnd,
    );

    if (!existing) {
      throw new NotFoundException('插件收益记录创建失败');
    }

    return existing;
  }

  async findEarnings(
    query: QueryPluginEarningsDtoType,
  ): Promise<PaginatedResult<PluginEarningWithPluginName>> {
    const parsedQuery = QueryPluginEarningsSchema.parse(query);

    return this.querySettlementHistory({
      pluginId: parsedQuery.pluginId,
      orgId: parsedQuery.orgId,
      payoutStatus: parsedQuery.payoutStatus,
      periodStart: parsedQuery.periodStart,
      periodEnd: parsedQuery.periodEnd,
      page: parsedQuery.page,
      pageSize: parsedQuery.pageSize,
    });
  }

  async findEarningById(id: string): Promise<PluginEarningWithPluginName> {
    const [earning] = await this.tenantDb
      .select({
        ...getTableColumns(pluginEarnings),
        pluginName: plugins.name,
      })
      .from(pluginEarnings)
      .leftJoin(plugins, eq(pluginEarnings.pluginDbId, plugins.id))
      .where(eq(pluginEarnings.id, id))
      .limit(1);

    if (!earning) {
      throw new NotFoundException(`插件收益记录 ${id} 不存在`);
    }

    return earning;
  }

  async updatePayoutStatus(
    id: string,
    data: UpdatePayoutStatusDtoType,
  ): Promise<PluginEarning> {
    await this.findEarningById(id);

    const parsedData = UpdatePayoutStatusSchema.parse(data);
    const updatePayload: Partial<NewPluginEarning> = {
      payoutStatus: parsedData.payoutStatus,
      updatedAt: new Date(),
      ...(parsedData.payoutReference !== undefined
        ? { payoutReference: parsedData.payoutReference }
        : {}),
      ...(parsedData.payoutAt !== undefined
        ? { payoutAt: new Date(parsedData.payoutAt) }
        : {}),
    };

    const [updated] = await this.tenantDb
      .update(pluginEarnings)
      .set(updatePayload)
      .where(eq(pluginEarnings.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`插件收益记录 ${id} 不存在`);
    }

    return updated;
  }

  async getEarningsSummary(orgId: string): Promise<EarningsSummary> {
    return this.querySummary([eq(pluginEarnings.sourceOrgId, orgId)]);
  }

  async getDashboardSummary(
    query: QueryPluginEarningsSummaryDtoType,
  ): Promise<EarningsSummary> {
    const parsedQuery = QueryPluginEarningsSummarySchema.parse(query);
    return this.querySummary(this.buildPeriodConditions(parsedQuery));
  }

  async getDashboardTrends(
    query: QueryPluginEarningsTrendDtoType,
  ): Promise<EarningsTrendPoint[]> {
    const parsedQuery = QueryPluginEarningsTrendSchema.parse(query);
    const whereClause = this.buildWhereClause(
      this.buildPeriodConditions(parsedQuery),
    );
    const bucket = sql<string>`date_trunc(${parsedQuery.interval}, ${pluginEarnings.periodEnd})::text`;

    const rows = await this.tenantDb
      .select({
        bucket,
        totalRevenue: sql<string>`coalesce(sum(${pluginEarnings.totalRevenue}), 0)::text`,
        developerShare: sql<string>`coalesce(sum(${pluginEarnings.developerShare}), 0)::text`,
        platformShare: sql<string>`coalesce(sum(${pluginEarnings.platformShare}), 0)::text`,
        listingCommission: sql<string>`coalesce(sum(${pluginEarnings.listingCommission}), 0)::text`,
        totalExecutions: sql<number>`coalesce(sum(${pluginEarnings.totalExecutions}), 0)::int`,
      })
      .from(pluginEarnings)
      .where(whereClause)
      .groupBy(bucket)
      .orderBy(asc(bucket));

    return rows.map((row) => ({
      bucket: row.bucket,
      totalRevenue: normalizeFixedScaleDecimal(row.totalRevenue),
      developerShare: normalizeFixedScaleDecimal(row.developerShare),
      platformShare: normalizeFixedScaleDecimal(row.platformShare),
      listingCommission: normalizeFixedScaleDecimal(row.listingCommission),
      totalExecutions: Number(row.totalExecutions),
    }));
  }

  async getDashboardRanking(
    query: QueryPluginEarningsRankingDtoType,
  ): Promise<EarningsRankingItem[]> {
    const parsedQuery = QueryPluginEarningsRankingSchema.parse(query);
    const whereClause = this.buildWhereClause(
      this.buildPeriodConditions(parsedQuery),
    );

    const rows = await this.tenantDb
      .select({
        pluginDbId: pluginEarnings.pluginDbId,
        pluginId: pluginEarnings.pluginId,
        pluginName: sql<string | null>`max(${plugins.name})`,
        totalRevenue: sql<string>`coalesce(sum(${pluginEarnings.totalRevenue}), 0)::text`,
        developerShare: sql<string>`coalesce(sum(${pluginEarnings.developerShare}), 0)::text`,
        platformShare: sql<string>`coalesce(sum(${pluginEarnings.platformShare}), 0)::text`,
        listingCommission: sql<string>`coalesce(sum(${pluginEarnings.listingCommission}), 0)::text`,
        totalExecutions: sql<number>`coalesce(sum(${pluginEarnings.totalExecutions}), 0)::int`,
      })
      .from(pluginEarnings)
      .leftJoin(plugins, eq(pluginEarnings.pluginDbId, plugins.id))
      .where(whereClause)
      .groupBy(pluginEarnings.pluginDbId, pluginEarnings.pluginId)
      .orderBy(
        sql`sum(${pluginEarnings.developerShare}) desc`,
        sql`sum(${pluginEarnings.totalRevenue}) desc`,
      )
      .limit(parsedQuery.limit);

    return rows.map((row) => ({
      pluginDbId: row.pluginDbId,
      pluginId: row.pluginId,
      pluginName: row.pluginName,
      totalRevenue: normalizeFixedScaleDecimal(row.totalRevenue),
      developerShare: normalizeFixedScaleDecimal(row.developerShare),
      platformShare: normalizeFixedScaleDecimal(row.platformShare),
      listingCommission: normalizeFixedScaleDecimal(row.listingCommission),
      totalExecutions: Number(row.totalExecutions),
    }));
  }

  async getDashboardHistory(
    query: QueryPluginEarningsHistoryDtoType,
  ): Promise<PaginatedResult<PluginEarningWithPluginName>> {
    const parsedQuery = QueryPluginEarningsHistorySchema.parse(query);

    return this.querySettlementHistory({
      payoutStatus: parsedQuery.payoutStatus,
      periodStart: parsedQuery.periodStart,
      periodEnd: parsedQuery.periodEnd,
      page: parsedQuery.page,
      pageSize: parsedQuery.pageSize,
    });
  }

  async findExistingEarning(
    pluginDbId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PluginEarning | null> {
    const [earning] = await this.tenantDb
      .select()
      .from(pluginEarnings)
      .where(
        and(
          eq(pluginEarnings.pluginDbId, pluginDbId),
          eq(pluginEarnings.periodStart, periodStart),
          eq(pluginEarnings.periodEnd, periodEnd),
        ),
      )
      .limit(1);

    return earning ?? null;
  }

  calculateSettlementShares(totalRevenue: FixedScaleDecimal): {
    totalRevenue: string;
    developerShare: string;
    platformShare: string;
    listingCommission: string;
  } {
    const grossDeveloperShare = totalRevenue.multiply(
      REVENUE_SPLIT.DEVELOPER_SHARE,
    );
    const listingCommission = grossDeveloperShare.multiply(
      REVENUE_SPLIT.LISTING_COMMISSION,
    );
    const developerShare = grossDeveloperShare.subtract(listingCommission);
    const platformShare = totalRevenue.multiply(REVENUE_SPLIT.PLATFORM_SHARE);

    return {
      totalRevenue: totalRevenue.toString(),
      developerShare: developerShare.toString(),
      platformShare: platformShare.toString(),
      listingCommission: listingCommission.toString(),
    };
  }

  private async querySummary(conditions: SQL[]): Promise<EarningsSummary> {
    const whereClause = this.buildWhereClause(conditions);
    const [summary] = await this.tenantDb
      .select({
        totalRevenue: sql<string>`coalesce(sum(${pluginEarnings.totalRevenue}), 0)::text`,
        totalDeveloperShare: sql<string>`coalesce(sum(${pluginEarnings.developerShare}), 0)::text`,
        totalPlatformShare: sql<string>`coalesce(sum(${pluginEarnings.platformShare}), 0)::text`,
        totalListingCommission: sql<string>`coalesce(sum(${pluginEarnings.listingCommission}), 0)::text`,
        pendingPayout: sql<string>`coalesce(sum(case when ${pluginEarnings.payoutStatus} = 'pending' then ${pluginEarnings.developerShare} else 0 end), 0)::text`,
        completedPayout: sql<string>`coalesce(sum(case when ${pluginEarnings.payoutStatus} = 'completed' then ${pluginEarnings.developerShare} else 0 end), 0)::text`,
        totalExecutions: sql<number>`coalesce(sum(${pluginEarnings.totalExecutions}), 0)::int`,
        pluginCount: sql<number>`coalesce(count(distinct ${pluginEarnings.pluginDbId}), 0)::int`,
      })
      .from(pluginEarnings)
      .where(whereClause);

    return {
      totalRevenue: normalizeFixedScaleDecimal(summary?.totalRevenue),
      totalDeveloperShare: normalizeFixedScaleDecimal(
        summary?.totalDeveloperShare,
      ),
      totalPlatformShare: normalizeFixedScaleDecimal(
        summary?.totalPlatformShare,
      ),
      totalListingCommission: normalizeFixedScaleDecimal(
        summary?.totalListingCommission,
      ),
      pendingPayout: normalizeFixedScaleDecimal(summary?.pendingPayout),
      completedPayout: normalizeFixedScaleDecimal(summary?.completedPayout),
      totalExecutions: Number(summary?.totalExecutions ?? 0),
      pluginCount: Number(summary?.pluginCount ?? 0),
    };
  }

  private async querySettlementHistory(
    query: EarningsListQuery,
  ): Promise<PaginatedResult<PluginEarningWithPluginName>> {
    const offset = (query.page - 1) * query.pageSize;
    const whereClause = this.buildWhereClause(this.buildListConditions(query));

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select({
          ...getTableColumns(pluginEarnings),
          pluginName: plugins.name,
        })
        .from(pluginEarnings)
        .leftJoin(plugins, eq(pluginEarnings.pluginDbId, plugins.id))
        .where(whereClause)
        .orderBy(desc(pluginEarnings.periodEnd), desc(pluginEarnings.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(pluginEarnings)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      },
    };
  }

  private buildListConditions(query: EarningsListQuery): SQL[] {
    const conditions = this.buildPeriodConditions(query);

    if (query.pluginId) {
      conditions.push(eq(pluginEarnings.pluginId, query.pluginId));
    }

    if (query.orgId) {
      conditions.push(eq(pluginEarnings.sourceOrgId, query.orgId));
    }

    if (query.payoutStatus) {
      conditions.push(eq(pluginEarnings.payoutStatus, query.payoutStatus));
    }

    return conditions;
  }

  private buildPeriodConditions(query: {
    orgId?: string;
    periodStart?: string;
    periodEnd?: string;
  }): SQL[] {
    const conditions: SQL[] = [];

    if (query.orgId) {
      conditions.push(eq(pluginEarnings.sourceOrgId, query.orgId));
    }

    if (query.periodStart) {
      conditions.push(
        gte(pluginEarnings.periodStart, new Date(query.periodStart)),
      );
    }

    if (query.periodEnd) {
      conditions.push(lte(pluginEarnings.periodEnd, new Date(query.periodEnd)));
    }

    return conditions;
  }

  private buildWhereClause(conditions: SQL[]): SQL | undefined {
    return conditions.length > 0 ? and(...conditions) : undefined;
  }
}
