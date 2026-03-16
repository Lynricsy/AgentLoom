import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  DeveloperKeyResponseDto,
  QueryDeveloperKeysDto,
  RegisterDeveloperKeyDto,
} from './dto/plugin-developer-key.dto';
import { PluginDeveloperKeyService } from './plugin-developer-key.service';

@ApiTags('Plugin Developer Keys')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('plugins/developer-keys')
export class PluginDeveloperKeyController {
  constructor(private readonly developerKeyService: PluginDeveloperKeyService) {}

  @Post()
  @Roles('creator', 'admin', 'owner')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '注册开发者公钥' })
  @ApiResponse({
    status: 201,
    description: '密钥注册成功。',
    type: DeveloperKeyResponseDto,
  })
  @ApiResponse({ status: 400, description: '公钥无效或已注册。' })
  async registerKey(
    @CurrentTenant() tenantId: string,
    @CurrentUser('org_id') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: RegisterDeveloperKeyDto,
  ) {
    return this.developerKeyService.registerKey(
      tenantId,
      orgId,
      userId,
      dto.publicKey,
      dto.label,
    );
  }

  @Get()
  @Roles('creator', 'admin', 'owner')
  @ApiOperation({ summary: '查询开发者密钥列表' })
  @ApiResponse({ status: 200, description: '密钥列表。' })
  async listKeys(
    @CurrentUser('org_id') orgId: string,
    @Query() query: QueryDeveloperKeysDto,
  ) {
    return this.developerKeyService.listKeys(orgId, query);
  }

  @Get(':id')
  @Roles('creator', 'admin', 'owner')
  @ApiOperation({ summary: '查询开发者密钥详情' })
  @ApiResponse({
    status: 200,
    description: '密钥详情。',
    type: DeveloperKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: '密钥不存在。' })
  async findById(
    @CurrentUser('org_id') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.developerKeyService.findById(orgId, id);
  }

  @Delete(':id')
  @Roles('creator', 'admin', 'owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '撤销开发者密钥' })
  @ApiResponse({
    status: 200,
    description: '密钥已撤销。',
    type: DeveloperKeyResponseDto,
  })
  @ApiResponse({ status: 400, description: '密钥已撤销。' })
  @ApiResponse({ status: 404, description: '密钥不存在。' })
  async revokeKey(
    @CurrentUser('org_id') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.developerKeyService.revokeKey(orgId, id);
  }
}
