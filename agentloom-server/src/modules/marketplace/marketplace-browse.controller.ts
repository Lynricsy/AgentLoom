import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { QueryPublicListingsDto } from './dto/marketplace.dto';
import { MarketplaceReviewUserService } from './marketplace-review-user.service';
import { MarketplaceService } from './marketplace.service';

@Public()
@ApiTags('Marketplace')
@Controller('marketplace/browse')
export class MarketplaceBrowseController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly reviewUserService: MarketplaceReviewUserService,
  ) {}

  @Get()
  @ApiOperation({ summary: '公开浏览 Marketplace listings' })
  @ApiResponse({ status: 200, description: '公开 listing 列表' })
  async list(@Query() query: QueryPublicListingsDto) {
    return this.marketplaceService.findPublicListings(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '公开查询 Marketplace listing 详情' })
  @ApiResponse({ status: 200, description: '公开 listing 详情' })
  @ApiResponse({ status: 404, description: 'Listing 不存在' })
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.marketplaceService.findPublicById(id);
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: '公开查询 Marketplace listing 评论' })
  @ApiResponse({ status: 200, description: '公开 listing 评论列表' })
  @ApiResponse({ status: 404, description: 'Listing 不存在' })
  async reviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reviewUserService.findReviewsByListing(
      id,
      query.page as number | undefined,
      query.pageSize as number | undefined,
    );
  }
}
