import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { and, desc, eq, sql } from 'drizzle-orm';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  marketplaceListings,
  type MarketplaceListing,
  type MarketplaceReviewResult,
  type NewMarketplaceListing,
  type PluginRecord,
} from '../../database/schema';
import {
  MarketplaceListingConflictException,
  MarketplaceListingNotFoundException,
} from '../marketplace/marketplace.exceptions';
import {
  QueryPluginEarningsHistoryDto,
  QueryPluginEarningsHistorySchema,
  QueryPluginEarningsRankingDto,
  QueryPluginEarningsRankingSchema,
  QueryPluginEarningsSummaryDto,
  QueryPluginEarningsSummarySchema,
  QueryPluginEarningsTrendDto,
  QueryPluginEarningsTrendSchema,
} from './dto/plugin-earnings.dto';
import {
  QueryPluginListingsDto,
  QueryPluginListingsSchema,
  SubmitPluginListingDto,
  SubmitPluginListingSchema,
  type SubmitPluginListingDtoType,
  UpdatePluginListingDto,
  UpdatePluginListingSchema,
  type UpdatePluginListingDtoType,
} from './dto/plugin-marketplace.dto';
import { PluginEarningsService } from './plugin-earnings.service';
import {
  PluginInactiveException,
  PluginPermissionDeniedException,
} from './plugin.exceptions';
import { PluginMarketplaceReviewService } from './plugin-marketplace-review.service';
import { PluginService } from './plugin.service';

@ApiTags('plugin-marketplace')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('plugins/marketplace')
export class PluginMarketplaceController {
  private readonly logger = new Logger(PluginMarketplaceController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly pluginService: PluginService,
    private readonly pluginEarningsService: PluginEarningsService,
    private readonly pluginMarketplaceReviewService: PluginMarketplaceReviewService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  private async resolveOrgId(tenantId: string): Promise<string> {
    return this.pluginService.resolveOrganizationId(tenantId);
  }

  private resolveCurrentMonthRange(): {
    periodStart: string;
    periodEnd: string;
  } {
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
    };
  }

  private formatTrendBucket(bucket: string): string {
    const normalizedBucket = bucket.trim();

    if (normalizedBucket.length >= 7) {
      return normalizedBucket.slice(0, 7);
    }

    return normalizedBucket;
  }

  @Post('listings')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '提交插件 Marketplace listing' })
  @ApiResponse({ status: 201, description: '插件 listing 创建成功' })
  @ApiResponse({ status: 404, description: '插件不存在或无权访问' })
  async submit(
    @Body() dto: SubmitPluginListingDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const parsedDto = SubmitPluginListingSchema.parse(dto);
    const plugin = await this.pluginService.findById(
      parsedDto.pluginDbId,
      tenantId,
    );

    this.ensurePluginCanManageMarketplace(plugin, userId);

    const existingListing = await this.findPluginListingByPluginDbId(
      tenantId,
      parsedDto.pluginDbId,
    );

    if (existingListing) {
      if (existingListing.status === 'listed') {
        throw new MarketplaceListingConflictException(
          '该插件已上架，请先下架后重新提交',
          existingListing.status,
        );
      }

      if (existingListing.status === 'pending_review') {
        throw new MarketplaceListingConflictException(
          '该插件正在审查中，请等待审查完成',
          existingListing.status,
        );
      }

      const { listing, reviewResult } = await this.resubmitListing(
        tenantId,
        userId,
        existingListing,
        plugin,
        parsedDto,
      );

      return { data: listing, reviewResult };
    }

    const { listing, reviewResult } = await this.createAndReviewListing(
      tenantId,
      userId,
      plugin,
      parsedDto,
    );

    return { data: listing, reviewResult };
  }

  @Get('listings')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '分页查询当前租户的插件 Marketplace listings' })
  @ApiResponse({ status: 200, description: '插件 listing 列表' })
  async findAll(
    @Query() query: QueryPluginListingsDto,
    @CurrentTenant() tenantId: string,
  ) {
    const parsedQuery = QueryPluginListingsSchema.parse(query);
    const page = parsedQuery.page;
    const pageSize = parsedQuery.pageSize;
    const offset = (page - 1) * pageSize;

    const conditions = [
      eq(marketplaceListings.tenantId, tenantId),
      eq(marketplaceListings.listingType, 'plugin'),
    ];

    if (parsedQuery.status) {
      conditions.push(eq(marketplaceListings.status, parsedQuery.status));
    }

    if (parsedQuery.pricingModel) {
      conditions.push(
        eq(marketplaceListings.pricingModel, parsedQuery.pricingModel),
      );
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(marketplaceListings)
        .where(whereClause)
        .orderBy(desc(marketplaceListings.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(marketplaceListings)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

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

  @Get('earnings/summary')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '查询插件 Marketplace 收益总览' })
  @ApiResponse({ status: 200, description: '收益总览' })
  async getEarningsSummary(
    @Query() query: QueryPluginEarningsSummaryDto,
    @CurrentTenant() tenantId: string,
  ) {
    const parsedQuery = QueryPluginEarningsSummarySchema.parse(query);
    const orgId = await this.resolveOrgId(tenantId);
    const summary = await this.pluginEarningsService.getDashboardSummary({
      ...parsedQuery,
      orgId,
    });
    const currentMonthSummary =
      await this.pluginEarningsService.getDashboardSummary({
        orgId,
        ...this.resolveCurrentMonthRange(),
      });

    return {
      totalRevenue: summary.totalRevenue,
      currentMonthRevenue: currentMonthSummary.totalRevenue,
      totalExecutions: summary.totalExecutions,
      activePlugins: summary.pluginCount,
    };
  }

  @Get('earnings/trends')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '查询插件 Marketplace 收益趋势' })
  @ApiResponse({ status: 200, description: '收益趋势' })
  async getEarningsTrends(
    @Query() query: QueryPluginEarningsTrendDto,
    @CurrentTenant() tenantId: string,
  ) {
    const parsedQuery = QueryPluginEarningsTrendSchema.parse(query);
    const orgId = await this.resolveOrgId(tenantId);
    const trends = await this.pluginEarningsService.getDashboardTrends({
      ...parsedQuery,
      orgId,
    });

    return trends.map((trend) => ({
      month: this.formatTrendBucket(trend.bucket),
      revenue: trend.totalRevenue,
      executions: trend.totalExecutions,
    }));
  }

  @Get('earnings/ranking')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '查询插件 Marketplace 收益排行' })
  @ApiResponse({ status: 200, description: '收益排行' })
  async getEarningsRanking(
    @Query() query: QueryPluginEarningsRankingDto,
    @CurrentTenant() tenantId: string,
  ) {
    const parsedQuery = QueryPluginEarningsRankingSchema.parse(query);
    const orgId = await this.resolveOrgId(tenantId);
    const ranking = await this.pluginEarningsService.getDashboardRanking({
      ...parsedQuery,
      orgId,
    });
    const totalExecutions = ranking.reduce(
      (sum, item) => sum + item.totalExecutions,
      0,
    );

    return ranking.map((item) => ({
      pluginId: item.pluginId,
      pluginName: item.pluginName ?? item.pluginId,
      executionCount: item.totalExecutions,
      revenue: item.totalRevenue,
      percentage:
        totalExecutions === 0
          ? 0
          : (item.totalExecutions / totalExecutions) * 100,
    }));
  }

  @Get('earnings/settlements')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '查询插件 Marketplace 收益结算历史' })
  @ApiResponse({ status: 200, description: '收益结算历史' })
  async getEarningsHistory(
    @Query() query: QueryPluginEarningsHistoryDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.buildSettlementHistoryResponse(query, tenantId);
  }

  @Get('earnings/history')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '查询插件 Marketplace 收益结算历史（兼容旧路径）' })
  @ApiResponse({ status: 200, description: '收益结算历史' })
  async getEarningsHistoryLegacy(
    @Query() query: QueryPluginEarningsHistoryDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.buildSettlementHistoryResponse(query, tenantId);
  }

  private async buildSettlementHistoryResponse(
    query: QueryPluginEarningsHistoryDto,
    tenantId: string,
  ) {
    const parsedQuery = QueryPluginEarningsHistorySchema.parse(query);
    const orgId = await this.resolveOrgId(tenantId);
    const history = await this.pluginEarningsService.getDashboardHistory({
      ...parsedQuery,
      orgId,
    });

    return {
      data: history.data.map((record) => ({
        id: record.id,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        pluginId: record.pluginId,
        pluginName: record.pluginName ?? record.pluginId,
        totalExecutions: record.totalExecutions,
        totalRevenue: record.totalRevenue,
        developerShare: record.developerShare,
        platformShare: record.platformShare,
        listingCommission: record.listingCommission,
        payoutStatus: record.payoutStatus,
        createdAt: record.createdAt,
      })),
      meta: history.meta,
    };
  }

  @Get('listings/:id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询单个插件 Marketplace listing 详情' })
  @ApiResponse({ status: 200, description: '插件 listing 详情' })
  @ApiResponse({ status: 404, description: '插件 listing 不存在' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ) {
    const listing = await this.findPluginListingById(tenantId, id);
    return { data: listing };
  }

  @Patch('listings/:id')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新插件 Marketplace listing' })
  @ApiResponse({ status: 200, description: '插件 listing 更新成功' })
  @ApiResponse({ status: 404, description: '插件或 listing 不存在' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePluginListingDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const parsedDto = UpdatePluginListingSchema.parse(dto);
    const currentListing = await this.findPluginListingById(tenantId, id);
    const currentPluginDbId = this.requirePluginDbId(currentListing, id);

    const currentPlugin = await this.pluginService.findById(
      currentPluginDbId,
      tenantId,
    );
    this.ensurePluginCanManageMarketplace(currentPlugin, userId);

    if (parsedDto.pluginDbId) {
      const targetPlugin = await this.pluginService.findById(
        parsedDto.pluginDbId,
        tenantId,
      );
      this.ensurePluginCanManageMarketplace(targetPlugin, userId);
    }

    const updateValues = this.buildUpdateValues(currentListing, parsedDto);

    if (!updateValues) {
      return { data: currentListing };
    }

    const [updated] = await this.tenantDb
      .update(marketplaceListings)
      .set(updateValues)
      .where(
        and(
          eq(marketplaceListings.id, id),
          eq(marketplaceListings.tenantId, tenantId),
          eq(marketplaceListings.listingType, 'plugin'),
        ),
      )
      .returning();

    if (!updated) {
      throw new MarketplaceListingNotFoundException(id);
    }

    return { data: updated };
  }

  @Post('listings/:id/unlist')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '下架插件 Marketplace listing' })
  @ApiResponse({ status: 200, description: '插件 listing 下架成功' })
  @ApiResponse({ status: 404, description: '插件 listing 不存在' })
  @ApiResponse({ status: 409, description: '状态冲突（非 listed 状态）' })
  async unlist(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const currentListing = await this.findPluginListingById(tenantId, id);
    const pluginDbId = this.requirePluginDbId(currentListing, id);
    const plugin = await this.pluginService.findById(pluginDbId, tenantId);

    this.ensurePluginCanManageMarketplace(plugin, userId);

    if (currentListing.status !== 'listed') {
      throw new MarketplaceListingConflictException(
        `仅已上架的 listing 可以下架，当前状态: ${currentListing.status}`,
        currentListing.status,
      );
    }

    const [updated] = await this.tenantDb
      .update(marketplaceListings)
      .set({
        status: 'unlisted',
        unlistedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketplaceListings.id, id),
          eq(marketplaceListings.tenantId, tenantId),
          eq(marketplaceListings.listingType, 'plugin'),
        ),
      )
      .returning();

    if (!updated) {
      throw new MarketplaceListingNotFoundException(id);
    }

    this.logger.log(
      JSON.stringify({
        action: 'plugin_marketplace_listing_unlisted',
        listingId: id,
        pluginDbId: currentListing.pluginDbId,
        tenantId,
        userId,
      }),
    );

    return { data: updated };
  }

  @Post('listings/:id/relist')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新上架插件 Marketplace listing' })
  @ApiResponse({ status: 200, description: '插件 listing 重新上架完成' })
  @ApiResponse({ status: 404, description: '插件 listing 不存在' })
  @ApiResponse({
    status: 409,
    description: '状态冲突（非 unlisted/review_failed 状态）',
  })
  async relist(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const currentListing = await this.findPluginListingById(tenantId, id);
    const pluginDbId = this.requirePluginDbId(currentListing, id);
    const plugin = await this.pluginService.findById(pluginDbId, tenantId);

    this.ensurePluginCanManageMarketplace(plugin, userId);

    if (
      currentListing.status !== 'unlisted' &&
      currentListing.status !== 'review_failed'
    ) {
      throw new MarketplaceListingConflictException(
        `仅已下架或审查失败的 listing 可以重新上架，当前状态: ${currentListing.status}`,
        currentListing.status,
      );
    }

    const { listing, reviewResult } = await this.reviewExistingListing(
      tenantId,
      userId,
      currentListing,
      plugin,
      {
        title: currentListing.title,
        summary: currentListing.summary,
        category: currentListing.category ?? undefined,
        tags: currentListing.tags,
        pricingModel: currentListing.pricingModel,
        pricePerExecution: currentListing.pricePerExecution ?? undefined,
      },
      'plugin_marketplace_listing_relisted',
    );

    return { data: listing, reviewResult };
  }

  private async findPluginListingById(
    tenantId: string,
    id: string,
  ): Promise<MarketplaceListing> {
    const [listing] = await this.tenantDb
      .select()
      .from(marketplaceListings)
      .where(
        and(
          eq(marketplaceListings.id, id),
          eq(marketplaceListings.tenantId, tenantId),
          eq(marketplaceListings.listingType, 'plugin'),
        ),
      )
      .limit(1);

    if (!listing) {
      throw new MarketplaceListingNotFoundException(id);
    }

    return listing;
  }

  private async findPluginListingByPluginDbId(
    tenantId: string,
    pluginDbId: string,
  ): Promise<MarketplaceListing | null> {
    const [listing] = await this.tenantDb
      .select()
      .from(marketplaceListings)
      .where(
        and(
          eq(marketplaceListings.pluginDbId, pluginDbId),
          eq(marketplaceListings.tenantId, tenantId),
          eq(marketplaceListings.listingType, 'plugin'),
        ),
      )
      .limit(1);

    return listing ?? null;
  }

  private ensurePluginCanManageMarketplace(
    plugin: Pick<PluginRecord, 'id' | 'pluginId' | 'status' | 'installedBy'>,
    userId: string,
  ): void {
    if (plugin.status !== 'active') {
      throw new PluginInactiveException(plugin.id);
    }

    if (plugin.installedBy !== userId) {
      throw new PluginPermissionDeniedException(
        plugin.pluginId,
        `仅安装该插件的用户可以管理插件 Marketplace listing：${plugin.pluginId}`,
      );
    }
  }

  private requirePluginDbId(
    listing: MarketplaceListing,
    listingId: string,
  ): string {
    if (!listing.pluginDbId) {
      throw new MarketplaceListingConflictException(
        `插件 listing ${listingId} 未绑定插件记录，无法继续操作`,
        listing.status,
      );
    }

    return listing.pluginDbId;
  }

  private async createAndReviewListing(
    tenantId: string,
    userId: string,
    plugin: PluginRecord,
    dto: SubmitPluginListingDtoType,
  ): Promise<{
    listing: MarketplaceListing;
    reviewResult: MarketplaceReviewResult;
  }> {
    const [created] = await this.tenantDb
      .insert(marketplaceListings)
      .values({
        tenantId,
        pluginDbId: plugin.id,
        listingType: 'plugin',
        title: dto.title,
        summary: dto.summary,
        category: dto.category,
        tags: dto.tags ?? [],
        pricingModel: dto.pricingModel,
        pricePerExecution: this.resolveCreatePricePerExecution(dto),
        status: 'pending_review',
        submittedBy: userId,
        submittedAt: new Date(),
      })
      .returning();

    const reviewResult = this.pluginMarketplaceReviewService.review({
      title: dto.title,
      summary: dto.summary,
      tags: dto.tags ?? [],
      plugin,
    });

    const newStatus =
      reviewResult.outcome === 'passed' ? 'listed' : 'review_failed';

    const [updated] = await this.tenantDb
      .update(marketplaceListings)
      .set({
        status: newStatus,
        reviewResult,
        publishedAt: newStatus === 'listed' ? new Date() : null,
        unlistedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceListings.id, created.id))
      .returning();

    this.logger.log(
      JSON.stringify({
        action: 'plugin_marketplace_listing_submitted',
        listingId: updated.id,
        pluginDbId: plugin.id,
        tenantId,
        userId,
        outcome: reviewResult.outcome,
      }),
    );

    return { listing: updated, reviewResult };
  }

  private async resubmitListing(
    tenantId: string,
    userId: string,
    currentListing: MarketplaceListing,
    plugin: PluginRecord,
    dto: SubmitPluginListingDtoType,
  ): Promise<{
    listing: MarketplaceListing;
    reviewResult: MarketplaceReviewResult;
  }> {
    return this.reviewExistingListing(
      tenantId,
      userId,
      currentListing,
      plugin,
      dto,
      'plugin_marketplace_listing_resubmitted',
    );
  }

  private async reviewExistingListing(
    tenantId: string,
    userId: string,
    currentListing: MarketplaceListing,
    plugin: PluginRecord,
    dto: Pick<
      SubmitPluginListingDtoType,
      | 'title'
      | 'summary'
      | 'category'
      | 'tags'
      | 'pricingModel'
      | 'pricePerExecution'
    >,
    action:
      | 'plugin_marketplace_listing_resubmitted'
      | 'plugin_marketplace_listing_relisted',
  ): Promise<{
    listing: MarketplaceListing;
    reviewResult: MarketplaceReviewResult;
  }> {
    await this.tenantDb
      .update(marketplaceListings)
      .set({
        pluginDbId: plugin.id,
        title: dto.title,
        summary: dto.summary,
        category: dto.category ?? null,
        tags: dto.tags ?? [],
        pricingModel: dto.pricingModel,
        pricePerExecution:
          dto.pricingModel === 'free' ? null : (dto.pricePerExecution ?? null),
        status: 'pending_review',
        submittedBy: userId,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketplaceListings.id, currentListing.id),
          eq(marketplaceListings.tenantId, tenantId),
          eq(marketplaceListings.listingType, 'plugin'),
        ),
      );

    const reviewResult = this.pluginMarketplaceReviewService.review({
      title: dto.title,
      summary: dto.summary,
      tags: dto.tags ?? [],
      plugin,
    });

    const newStatus =
      reviewResult.outcome === 'passed' ? 'listed' : 'review_failed';

    const [updated] = await this.tenantDb
      .update(marketplaceListings)
      .set({
        status: newStatus,
        reviewResult,
        publishedAt: newStatus === 'listed' ? new Date() : null,
        unlistedAt: newStatus === 'listed' ? null : currentListing.unlistedAt,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceListings.id, currentListing.id))
      .returning();

    this.logger.log(
      JSON.stringify({
        action,
        listingId: updated.id,
        pluginDbId: plugin.id,
        tenantId,
        userId,
        outcome: reviewResult.outcome,
      }),
    );

    return { listing: updated, reviewResult };
  }

  private buildUpdateValues(
    currentListing: MarketplaceListing,
    dto: UpdatePluginListingDtoType,
  ): Partial<NewMarketplaceListing> | null {
    const updateValues: Partial<NewMarketplaceListing> = {};

    if (dto.pluginDbId !== undefined) {
      updateValues.pluginDbId = dto.pluginDbId;
    }

    if (dto.title !== undefined) {
      updateValues.title = dto.title;
    }

    if (dto.summary !== undefined) {
      updateValues.summary = dto.summary;
    }

    if (dto.category !== undefined) {
      updateValues.category = dto.category;
    }

    if (dto.tags !== undefined) {
      updateValues.tags = dto.tags;
    }

    if (dto.pricingModel !== undefined) {
      updateValues.pricingModel = dto.pricingModel;
    }

    if (dto.pricingModel !== undefined || dto.pricePerExecution !== undefined) {
      updateValues.pricePerExecution = this.resolveUpdatedPricePerExecution(
        currentListing,
        dto,
      );
    }

    if (Object.keys(updateValues).length === 0) {
      return null;
    }

    updateValues.updatedAt = new Date();

    return updateValues;
  }

  private resolveCreatePricePerExecution(
    dto: SubmitPluginListingDtoType,
  ): string | null {
    if (dto.pricingModel === 'free') {
      return null;
    }

    return dto.pricePerExecution ?? null;
  }

  private resolveUpdatedPricePerExecution(
    currentListing: MarketplaceListing,
    dto: UpdatePluginListingDtoType,
  ): string | null {
    const targetPricingModel = dto.pricingModel ?? currentListing.pricingModel;

    if (targetPricingModel === 'free') {
      return null;
    }

    return dto.pricePerExecution ?? currentListing.pricePerExecution;
  }
}
