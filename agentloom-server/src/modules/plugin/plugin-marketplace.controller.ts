import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
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
  type NewMarketplaceListing,
} from '../../database/schema';
import { MarketplaceListingNotFoundException } from '../marketplace/marketplace.exceptions';
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
import { PluginService } from './plugin.service';

@ApiTags('plugin-marketplace')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('plugins/marketplace')
export class PluginMarketplaceController {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly pluginService: PluginService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  @Post('listings')
  @Roles('owner', 'admin')
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

    await this.pluginService.findById(parsedDto.pluginDbId, tenantId);

    const [created] = await this.tenantDb
      .insert(marketplaceListings)
      .values({
        tenantId,
        pluginDbId: parsedDto.pluginDbId,
        listingType: 'plugin',
        title: parsedDto.title,
        summary: parsedDto.summary,
        category: parsedDto.category,
        tags: parsedDto.tags ?? [],
        pricingModel: parsedDto.pricingModel,
        pricePerExecution: this.resolveCreatePricePerExecution(parsedDto),
        status: 'pending_review',
        submittedBy: userId,
        submittedAt: new Date(),
      })
      .returning();

    return { data: created };
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
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新插件 Marketplace listing' })
  @ApiResponse({ status: 200, description: '插件 listing 更新成功' })
  @ApiResponse({ status: 404, description: '插件或 listing 不存在' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePluginListingDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') _userId: string,
  ) {
    const parsedDto = UpdatePluginListingSchema.parse(dto);
    const currentListing = await this.findPluginListingById(tenantId, id);

    if (parsedDto.pluginDbId) {
      await this.pluginService.findById(parsedDto.pluginDbId, tenantId);
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
