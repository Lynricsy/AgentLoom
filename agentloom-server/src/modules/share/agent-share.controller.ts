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
import type { CreateAgentShareDto } from './dto/create-agent-share.dto';
import { CreateAgentShareSchema } from './dto/create-agent-share.dto';
import type { QueryAgentShareDto } from './dto/query-agent-share.dto';
import { QueryAgentShareSchema } from './dto/query-agent-share.dto';
import { AgentShareImportService } from './agent-share-import.service';
import { ShareService } from './share.service';

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
};

@ApiTags('Agent Shares')
@Controller('agent-shares')
export class AgentShareController {
  constructor(
    private readonly shareService: ShareService,
    private readonly agentShareImportService: AgentShareImportService,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建 Agent 分享链接' })
  @ApiResponse({ status: 201, description: '分享链接创建成功' })
  async create(
    @Body(new ZodValidationPipe(CreateAgentShareSchema))
    dto: CreateAgentShareDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.shareService.createAgentShare(
      this.getTenantId(req),
      req.user.sub,
      dto,
    );

    return { data };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '分页查询租户下的 Agent 分享链接' })
  @ApiResponse({ status: 200, description: '分享链接列表' })
  async list(
    @Query(new ZodValidationPipe(QueryAgentShareSchema))
    query: QueryAgentShareDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.shareService.findSharesByAgent(this.getTenantId(req), query);
  }

  @Delete(':shareId')
  @Roles('owner', 'admin', 'creator')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '撤销 Agent 分享链接' })
  @ApiResponse({ status: 204, description: '分享链接已撤销' })
  async revoke(
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.shareService.revokeAgentShare(this.getTenantId(req), shareId);
  }

  @Post(':token/import')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '从 Agent 分享链接导入 Agent 副本' })
  @ApiResponse({ status: 200, description: 'Agent 导入成功' })
  async import(
    @Param('token') token: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.agentShareImportService.importFromShare(
      token,
      this.getTenantId(req),
      req.user.sub,
    );

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
