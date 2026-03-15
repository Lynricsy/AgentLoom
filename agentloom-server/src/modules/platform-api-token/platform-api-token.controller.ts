import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Post } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { CreatePlatformApiTokenDto } from './dto/create-platform-api-token.dto';
import { CreatePlatformApiTokenSchema } from './dto/create-platform-api-token.dto';
import type { QueryPlatformApiTokenDto } from './dto/query-platform-api-token.dto';
import { QueryPlatformApiTokenSchema } from './dto/query-platform-api-token.dto';
import { PlatformApiTokenService } from './platform-api-token.service';

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
};

@ApiTags('Platform API Tokens')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('platform-api-tokens')
@Roles('owner', 'admin', 'creator')
export class PlatformApiTokenController {
  constructor(
    private readonly platformApiTokenService: PlatformApiTokenService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建 API Token' })
  @ApiResponse({ status: 201, description: 'Token 创建成功，仅此次返回明文' })
  @ApiResponse({ status: 409, description: 'Token 数量超限' })
  @ApiResponse({ status: 422, description: '请求参数校验失败' })
  async create(
    @Body(new ZodValidationPipe(CreatePlatformApiTokenSchema))
    dto: CreatePlatformApiTokenDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.platformApiTokenService.generateToken(
      this.getTenantId(req),
      req.user.sub,
      dto,
    );

    return { data };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '分页查询当前用户的 API Token 列表' })
  @ApiResponse({ status: 200, description: 'Token 列表' })
  async list(
    @Query(new ZodValidationPipe(QueryPlatformApiTokenSchema))
    query: QueryPlatformApiTokenDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platformApiTokenService.findAll(
      this.getTenantId(req),
      req.user.sub,
      query,
    );
  }

  @Delete(':tokenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '撤销 API Token' })
  @ApiResponse({ status: 204, description: 'Token 已撤销' })
  @ApiResponse({ status: 404, description: 'Token 不存在' })
  @ApiResponse({ status: 409, description: 'Token 已被撤销' })
  async revoke(
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.platformApiTokenService.revoke(
      this.getTenantId(req),
      req.user.sub,
      tokenId,
    );
  }

  private getTenantId(req: AuthenticatedRequest): string {
    const tenantId = req.tenantId ?? req.user.tenantId;

    if (!tenantId) {
      throw new TenantRequiredException();
    }

    return tenantId;
  }
}
