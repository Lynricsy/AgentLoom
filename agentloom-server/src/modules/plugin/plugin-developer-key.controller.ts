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
import { PluginService } from './plugin.service';
import type { JwtPayload } from '../../common/guards/auth.guard';

@ApiTags('Plugin Developer Keys')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('plugins/developer-keys')
export class PluginDeveloperKeyController {
  constructor(
    private readonly developerKeyService: PluginDeveloperKeyService,
    private readonly pluginService: PluginService,
  ) {}

  private async resolveOrgId(
    tenantId: string,
    user: Pick<JwtPayload, 'orgId' | 'org_id'>,
  ): Promise<string> {
    return (
      user.orgId ??
      user.org_id ??
      this.pluginService.resolveOrganizationId(tenantId)
    );
  }

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
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterDeveloperKeyDto,
  ) {
    const orgId = await this.resolveOrgId(tenantId, user);
    return this.developerKeyService.registerKey(
      tenantId,
      orgId,
      user.sub,
      dto.publicKey,
      dto.label,
    );
  }

  @Get()
  @Roles('creator', 'admin', 'owner')
  @ApiOperation({ summary: '查询开发者密钥列表' })
  @ApiResponse({ status: 200, description: '密钥列表。' })
  async listKeys(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryDeveloperKeysDto,
  ) {
    const orgId = await this.resolveOrgId(tenantId, user);
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
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const orgId = await this.resolveOrgId(tenantId, user);
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
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const orgId = await this.resolveOrgId(tenantId, user);
    return this.developerKeyService.revokeKey(orgId, id);
  }
}
