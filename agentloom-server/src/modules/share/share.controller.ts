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
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { CreateShareDto } from './dto/create-share.dto';
import { CreateShareSchema } from './dto/create-share.dto';
import type { QueryShareDto } from './dto/query-share.dto';
import { QueryShareSchema } from './dto/query-share.dto';
import { ShareService } from './share.service';

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
};

@ApiTags('Workflow Shares')
@Controller('workflow-shares')
@Roles('owner', 'admin', 'creator')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建工作流分享链接' })
  @ApiResponse({ status: 201, description: '分享链接创建成功' })
  @ApiResponse({ status: 404, description: '工作流不存在' })
  @ApiResponse({ status: 409, description: '工作流未发布' })
  async create(
    @Body(new ZodValidationPipe(CreateShareSchema)) dto: CreateShareDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.shareService.createShare(
      this.getTenantId(req),
      req.user.sub,
      dto,
    );

    return { data };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '分页查询租户下的工作流分享链接' })
  @ApiResponse({ status: 200, description: '分享链接列表' })
  async list(
    @Query(new ZodValidationPipe(QueryShareSchema)) query: QueryShareDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.shareService.findSharesByWorkflow(this.getTenantId(req), query);
  }

  @Delete(':shareId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '撤销工作流分享链接' })
  @ApiResponse({ status: 204, description: '分享链接已撤销' })
  @ApiResponse({ status: 404, description: '分享链接不存在' })
  async revoke(
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.shareService.revokeShare(this.getTenantId(req), shareId);
  }

  @Post(':token/copy')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '记录分享链接复制次数' })
  @ApiResponse({ status: 200, description: '复制计数已更新' })
  @ApiResponse({ status: 404, description: '分享链接不存在' })
  @ApiResponse({ status: 409, description: '分享链接不支持复制或工作流未发布' })
  @ApiResponse({ status: 410, description: '分享链接已过期或已撤销' })
  async incrementCopyCount(@Param('token') token: string) {
    const data = await this.shareService.incrementCopyCount(token);
    return { data };
  }

  private getTenantId(req: AuthenticatedRequest): string {
    const tenantId = req.tenantId ?? req.user.tenantId;

    if (!tenantId) {
      throw new TenantRequiredException();
    }

    return tenantId;
  }
}
