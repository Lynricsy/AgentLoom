import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

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
  QueryPluginEarningsSchema,
  UpdatePayoutStatusSchema,
  type CreateEarningsRecordDtoType,
  type QueryPluginEarningsDtoType,
  type UpdatePayoutStatusDtoType,
} from './dto/plugin-earnings.dto';

/** Revenue split ratios */
export const REVENUE_SPLIT = {
  DEVELOPER_SHARE: 0.70, // 70% to developer
  PLATFORM_SHARE: 0.30, // 30% to platform
  LISTING_COMMISSION: 0.15, // 15% commission on developer share
} as const;

type PaginatedResult = {
  data: PluginEarning[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type EarningsSummary = {
  totalRevenue: string;
  totalDeveloperShare: string;
  totalPlatformShare: string;
  pendingPayout: string;
  completedPayout: string;
};

@Injectable()
export class PluginEarningsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb() {
    return getTenantDb(this.db);
  }

  async createEarningsRecord(
    data: CreateEarningsRecordDtoType,
  ): Promise<PluginEarning> {
    const parsedData = CreateEarningsRecordSchema.parse(data);
    const tenantId = await this.findPluginTenantId(
      parsedData.pluginDbId,
      parsedData.orgId,
    );

    const values: NewPluginEarning = {
      tenantId,
      pluginDbId: parsedData.pluginDbId,
      pluginId: parsedData.pluginId,
      orgId: parsedData.orgId,
      periodStart: new Date(parsedData.periodStart),
      periodEnd: new Date(parsedData.periodEnd),
      totalExecutions: parsedData.totalExecutions,
      totalRevenue: parsedData.totalRevenue,
      developerShare: parsedData.developerShare,
      platformShare: parsedData.platformShare,
      listingCommission: parsedData.listingCommission,
      currency: parsedData.currency,
      payoutStatus: parsedData.payoutStatus,
      metadata: parsedData.metadata,
    };

    const [created] = await this.tenantDb
      .insert(pluginEarnings)
      .values(values)
      .returning();

    return created;
  }

  async findEarnings(
    query: QueryPluginEarningsDtoType,
  ): Promise<PaginatedResult> {
    const parsedQuery = QueryPluginEarningsSchema.parse(query);
    const page = parsedQuery.page;
    const pageSize = parsedQuery.pageSize;
    const offset = (page - 1) * pageSize;

    const conditions: SQL[] = [];

    if (parsedQuery.pluginId) {
      conditions.push(eq(pluginEarnings.pluginId, parsedQuery.pluginId));
    }

    if (parsedQuery.orgId) {
      conditions.push(eq(pluginEarnings.orgId, parsedQuery.orgId));
    }

    if (parsedQuery.payoutStatus) {
      conditions.push(eq(pluginEarnings.payoutStatus, parsedQuery.payoutStatus));
    }

    if (parsedQuery.periodStart) {
      conditions.push(
        gte(pluginEarnings.periodStart, new Date(parsedQuery.periodStart)),
      );
    }

    if (parsedQuery.periodEnd) {
      conditions.push(lte(pluginEarnings.periodEnd, new Date(parsedQuery.periodEnd)));
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(pluginEarnings)
        .where(whereClause)
        .orderBy(desc(pluginEarnings.periodEnd))
        .limit(pageSize)
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
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findEarningById(id: string): Promise<PluginEarning> {
    const [earning] = await this.tenantDb
      .select()
      .from(pluginEarnings)
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
    const [summary] = await this.tenantDb
      .select({
        totalRevenue: sql<string>`coalesce(sum(${pluginEarnings.totalRevenue}), 0)::text`,
        totalDeveloperShare: sql<string>`coalesce(sum(${pluginEarnings.developerShare}), 0)::text`,
        totalPlatformShare: sql<string>`coalesce(sum(${pluginEarnings.platformShare}), 0)::text`,
        pendingPayout: sql<string>`coalesce(sum(case when ${pluginEarnings.payoutStatus} = 'pending' then ${pluginEarnings.developerShare} else 0 end), 0)::text`,
        completedPayout: sql<string>`coalesce(sum(case when ${pluginEarnings.payoutStatus} = 'completed' then ${pluginEarnings.developerShare} else 0 end), 0)::text`,
      })
      .from(pluginEarnings)
      .where(eq(pluginEarnings.orgId, orgId));

    return {
      totalRevenue: summary?.totalRevenue ?? '0',
      totalDeveloperShare: summary?.totalDeveloperShare ?? '0',
      totalPlatformShare: summary?.totalPlatformShare ?? '0',
      pendingPayout: summary?.pendingPayout ?? '0',
      completedPayout: summary?.completedPayout ?? '0',
    };
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

  private async findPluginTenantId(
    pluginDbId: string,
    orgId: string,
  ): Promise<string> {
    const [plugin] = await this.tenantDb
      .select({ tenantId: plugins.tenantId })
      .from(plugins)
      .where(and(eq(plugins.id, pluginDbId), eq(plugins.orgId, orgId)))
      .limit(1);

    if (!plugin) {
      throw new NotFoundException(`插件 ${pluginDbId} 不存在`);
    }

    return plugin.tenantId;
  }
}
