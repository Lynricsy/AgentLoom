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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/guards/auth.guard';
import type { TenantEncryptionKey } from '../../database/schema';
import { TenantOrganizationResolver } from '../../common/providers/tenant-organization.resolver';
import {
  type TenantKeyDetailResponse,
  TenantKeyDetailResponseDto,
  type TenantKeyResponse,
  TenantKeyResponseDto,
  UploadPublicKeyDto,
} from './dto/tenant-key.dto';
import { TenantOrganizationNotFoundException } from './exceptions/tenant-key.exceptions';
import { TenantKeyService } from './tenant-key.service';

@ApiTags('tenant-keys')
@Controller('tenant-keys')
export class TenantKeyController {
  constructor(
    private readonly tenantKeyService: TenantKeyService,
    private readonly tenantOrganizationResolver: TenantOrganizationResolver,
  ) {}

  @Post()
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '上传租户公钥' })
  @ApiResponse({
    status: 201,
    description: '租户公钥上传成功',
    type: TenantKeyDetailResponseDto,
  })
  @ApiResponse({ status: 400, description: '公钥无效' })
  @ApiResponse({ status: 409, description: '组织已存在活跃密钥' })
  async uploadPublicKey(
    @Body() dto: UploadPublicKeyDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TenantKeyDetailResponse> {
    const orgId = await this.resolveOrgId(tenantId, user);
    const key = await this.tenantKeyService.uploadPublicKey(
      tenantId,
      orgId,
      dto,
    );
    return this.toDetailResponse(key);
  }

  @Get()
  @Roles('operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '查询当前组织的租户密钥列表' })
  @ApiResponse({
    status: 200,
    description: '租户密钥列表',
    type: TenantKeyResponseDto,
    isArray: true,
  })
  async findByOrg(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TenantKeyResponse[]> {
    const orgId = await this.resolveOrgId(tenantId, user);
    const keys = await this.tenantKeyService.findByOrg(tenantId, orgId);
    return keys.map((key) => this.toResponse(key));
  }

  @Get(':id')
  @Roles('operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '查询租户密钥详情' })
  @ApiResponse({
    status: 200,
    description: '租户密钥详情',
    type: TenantKeyDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: '租户密钥不存在' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ): Promise<TenantKeyDetailResponse> {
    const key = await this.tenantKeyService.findById(tenantId, id);
    return this.toDetailResponse(key);
  }

  @Post(':id/rotate')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '轮换租户公钥' })
  @ApiResponse({
    status: 200,
    description: '租户公钥轮换成功',
    type: TenantKeyDetailResponseDto,
  })
  @ApiResponse({ status: 400, description: '公钥无效' })
  @ApiResponse({ status: 404, description: '租户密钥不存在' })
  @ApiResponse({ status: 409, description: '密钥已被撤销' })
  async rotateKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadPublicKeyDto,
    @CurrentTenant() tenantId: string,
  ): Promise<TenantKeyDetailResponse> {
    const key = await this.tenantKeyService.rotateKey(tenantId, id, dto);
    return this.toDetailResponse(key);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '撤销租户密钥' })
  @ApiResponse({
    status: 200,
    description: '租户密钥撤销成功',
    type: TenantKeyDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: '租户密钥不存在' })
  @ApiResponse({ status: 409, description: '密钥已被撤销' })
  async revokeKey(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenantId: string,
  ): Promise<TenantKeyDetailResponse> {
    const key = await this.tenantKeyService.revokeKey(tenantId, id);
    return this.toDetailResponse(key);
  }

  private async resolveOrgId(
    tenantId: string,
    user: Pick<JwtPayload, 'orgId' | 'org_id'>,
  ): Promise<string> {
    const claimedOrgId = user.orgId ?? user.org_id;
    if (claimedOrgId) {
      return claimedOrgId;
    }

    // JWT 不保证携带组织 claim，因此回查组织，避免 undefined 进入 Drizzle 条件。
    const resolvedOrgId =
      await this.tenantOrganizationResolver.findOrganizationId(tenantId);
    if (!resolvedOrgId) {
      throw new TenantOrganizationNotFoundException(tenantId);
    }

    return resolvedOrgId;
  }

  private toResponse(key: TenantEncryptionKey): TenantKeyResponse {
    return {
      id: key.id,
      orgId: key.organizationId,
      keyFingerprint: key.keyFingerprint,
      status: key.status,
      activatedAt: key.activatedAt?.toISOString() ?? null,
      rotatedAt: key.rotatedAt?.toISOString() ?? null,
      revokedAt: key.revokedAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
      updatedAt: key.updatedAt.toISOString(),
    };
  }

  private toDetailResponse(key: TenantEncryptionKey): TenantKeyDetailResponse {
    return {
      ...this.toResponse(key),
      publicKey: key.publicKey,
    };
  }
}
