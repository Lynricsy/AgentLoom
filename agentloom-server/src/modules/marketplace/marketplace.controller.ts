import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  InstallMarketplaceListingDto,
  QueryMyListingsDto,
  SubmitMarketplaceListingDto,
  SubmitReviewDto,
} from './dto/marketplace.dto';
import { MarketplaceReviewUserService } from './marketplace-review-user.service';
import { MarketplaceService } from './marketplace.service';

@ApiTags('Marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly reviewUserService: MarketplaceReviewUserService,
  ) {}

  @Post('listings')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '提交工作流到 Marketplace（含自动审查）' })
  @ApiResponse({ status: 201, description: '提交成功' })
  @ApiResponse({ status: 404, description: '工作流版本不存在或无权访问' })
  @ApiResponse({ status: 409, description: '状态冲突（已上架/审查中）' })
  @ApiResponse({ status: 422, description: '审查未通过' })
  async submit(
    @Body() dto: SubmitMarketplaceListingDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const { listing, reviewResult } = await this.marketplaceService.submit(
      tenantId,
      userId,
      dto,
    );
    return { data: listing, reviewResult };
  }

  @Post('listings/:id/unlist')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '下架 Marketplace listing' })
  @ApiResponse({ status: 200, description: '下架成功' })
  @ApiResponse({ status: 404, description: 'Listing 不存在' })
  @ApiResponse({ status: 409, description: '状态冲突（非 listed 状态）' })
  async unlist(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const listing = await this.marketplaceService.unlist(tenantId, id, userId);
    return { data: listing };
  }

  @Post('listings/:id/relist')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新上架 Marketplace listing（含重新审查）' })
  @ApiResponse({ status: 200, description: '重新上架完成' })
  @ApiResponse({ status: 404, description: 'Listing 不存在' })
  @ApiResponse({ status: 409, description: '状态冲突（非 unlisted 状态）' })
  async relist(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const { listing, reviewResult } = await this.marketplaceService.relist(
      tenantId,
      id,
      userId,
    );
    return { data: listing, reviewResult };
  }

  @Get('my-listings')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询我的 Marketplace listings' })
  @ApiResponse({ status: 200, description: 'Listing 列表' })
  async findMyListings(
    @Query() query: QueryMyListingsDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.marketplaceService.findMyListings(tenantId, query);
  }

  @Get('listings/:id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询 Marketplace listing 详情' })
  @ApiResponse({ status: 200, description: 'Listing 详情' })
  @ApiResponse({ status: 404, description: 'Listing 不存在' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ) {
    const listing = await this.marketplaceService.findById(tenantId, id);
    return { data: listing };
  }

  @Post('listings/:id/install')
  @Roles('owner', 'admin', 'creator', 'operator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '一键安装 Marketplace listing 到当前租户' })
  @ApiResponse({ status: 201, description: '安装成功' })
  @ApiResponse({ status: 404, description: 'Listing 不存在' })
  async install(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstallMarketplaceListingDto,
  ) {
    return this.marketplaceService.installListing(tenantId, userId, id, dto);
  }

  @Post('listings/:id/reviews')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '提交 Marketplace listing 用户评论' })
  @ApiResponse({ status: 201, description: '评论提交成功' })
  @ApiResponse({ status: 404, description: 'Listing 不存在' })
  @ApiResponse({ status: 409, description: '用户已评论该 listing' })
  async submitReview(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.reviewUserService.submitReview(userId, id, dto);
  }
}
