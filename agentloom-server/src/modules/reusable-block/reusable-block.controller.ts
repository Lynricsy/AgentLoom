import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { ReusableBlock } from '../../database/schema/reusable-blocks.schema';
import {
  CreateReusableBlockDto,
  QueryReusableBlockDto,
  UpdateReusableBlockDto,
} from './dto/reusable-block.dto';
import { ReusableBlockService } from './reusable-block.service';

@ApiTags('Reusable Blocks')
@Controller('reusable-blocks')
export class ReusableBlockController {
  constructor(private readonly reusableBlockService: ReusableBlockService) {}

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询可复用块列表' })
  @ApiResponse({ status: 200, description: '可复用块列表' })
  async findAll(
    @Query() query: QueryReusableBlockDto,
    @CurrentTenant() tenantId: string,
  ): Promise<{
    data: Array<Omit<ReusableBlock, 'definition'>>;
    meta: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    return this.reusableBlockService.findAll(tenantId, query);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '查询可复用块详情' })
  @ApiResponse({ status: 200, description: '可复用块详情' })
  @ApiResponse({ status: 404, description: '可复用块不存在' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ): Promise<{ data: ReusableBlock }> {
    const data = await this.reusableBlockService.findById(tenantId, id);
    return { data };
  }

  @Post()
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建可复用块' })
  @ApiResponse({ status: 201, description: '可复用块创建成功' })
  @ApiResponse({ status: 422, description: '可复用块定义无效' })
  async create(
    @Body() dto: CreateReusableBlockDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ): Promise<{ data: ReusableBlock }> {
    const data = await this.reusableBlockService.create(tenantId, userId, dto);
    return { data };
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '更新可复用块' })
  @ApiResponse({ status: 200, description: '可复用块更新成功' })
  @ApiResponse({ status: 404, description: '可复用块不存在' })
  @ApiResponse({ status: 409, description: '版本冲突' })
  @ApiResponse({ status: 422, description: '可复用块定义无效' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReusableBlockDto,
    @CurrentTenant() tenantId: string,
  ): Promise<{ data: ReusableBlock }> {
    const data = await this.reusableBlockService.update(tenantId, id, dto);
    return { data };
  }

  @Delete(':id')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除可复用块' })
  @ApiResponse({ status: 204, description: '可复用块删除成功' })
  @ApiResponse({ status: 404, description: '可复用块不存在' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ): Promise<void> {
    await this.reusableBlockService.remove(tenantId, id);
  }
}
