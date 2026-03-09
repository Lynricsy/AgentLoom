import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RotateApiKeyDto } from './dto/rotate-api-key.dto';

@ApiTags('API Keys')
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建 API 密钥' })
  @ApiResponse({ status: 201, description: 'API 密钥创建成功' })
  async create(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser('sub') userId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.apiKeyService.create(dto, userId, tenantId);
    return { data };
  }

  @Get()
  @Roles('owner', 'admin', 'operator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取租户下所有 API 密钥' })
  @ApiResponse({ status: 200, description: 'API 密钥列表' })
  async findAll(@CurrentTenant() tenantId: string) {
    const data = await this.apiKeyService.findAllByTenant(tenantId);
    return { data };
  }

  @Put(':id/rotate')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '轮换 API 密钥' })
  @ApiResponse({ status: 200, description: 'API 密钥轮换成功' })
  async rotate(
    @Param('id') id: string,
    @Body() dto: RotateApiKeyDto,
    @CurrentUser('sub') userId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.apiKeyService.rotate(id, dto, tenantId, userId);
    return { data };
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '撤销 API 密钥' })
  @ApiResponse({ status: 200, description: 'API 密钥已撤销' })
  async revoke(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.apiKeyService.revoke(id, tenantId, userId);
    return { data };
  }
}
