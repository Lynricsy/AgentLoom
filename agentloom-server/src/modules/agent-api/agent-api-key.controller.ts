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
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { API_GLOBAL_PREFIX } from '../../openapi/swagger-document';
import { CaptureAuditLog } from '../evidence/audit-log.capture';
import { agentApiKeyAuditConfigs } from './agent-api-key.audit';
import { AgentApiKeyService } from './agent-api-key.service';
import {
  AgentApiKeyCreateEnvelopeSwaggerDto,
  AgentApiKeyListResponseSwaggerDto,
} from './dto/agent-api-key-response.dto';
import {
  CreateAgentApiKeySchema,
  CreateAgentApiKeySwaggerDto,
  type CreateAgentApiKeyDto,
} from './dto/create-agent-api-key.dto';
import {
  QueryAgentApiKeySchema,
  QueryAgentApiKeySwaggerDto,
} from './dto/query-agent-api-key.dto';

@ApiTags('Agent API Keys')
@ApiBearerAuth()
@Controller('agent-definitions/:agentId/api-keys')
export class AgentApiKeyController {
  constructor(private readonly agentApiKeyService: AgentApiKeyService) {}

  @Post()
  @RequirePermission('agent-api-key:manage')
  @HttpCode(HttpStatus.CREATED)
  @CaptureAuditLog(agentApiKeyAuditConfigs.create)
  @ApiOperation({ summary: '创建 Agent 专用 API Key（明文仅返回一次）' })
  @ApiBody({ type: CreateAgentApiKeySwaggerDto })
  @ApiResponse({
    status: 201,
    description: 'Key 创建成功',
    type: AgentApiKeyCreateEnvelopeSwaggerDto,
  })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'Agent 不存在' })
  @ApiResponse({ status: 409, description: '未吊销 Key 数量超限' })
  @ApiResponse({ status: 422, description: '请求参数校验失败' })
  async create(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body(new ZodValidationPipe(CreateAgentApiKeySchema))
    dto: CreateAgentApiKeyDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const data = await this.agentApiKeyService.create(
      tenantId,
      agentId,
      userId,
      dto,
    );

    reply.header(
      'Location',
      `/${API_GLOBAL_PREFIX}/agent-definitions/${agentId}/api-keys/${data.id}`,
    );
    return { data };
  }

  @Get()
  @RequirePermission('agent-api-key:read')
  @ApiOperation({ summary: '分页列出 Agent 的 API Key' })
  @ApiResponse({
    status: 200,
    description: 'Key 列表（createdAt 倒序）',
    type: AgentApiKeyListResponseSwaggerDto,
  })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'Agent 不存在' })
  async list(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query(new ZodValidationPipe(QueryAgentApiKeySchema))
    query: QueryAgentApiKeySwaggerDto,
  ) {
    return this.agentApiKeyService.list(agentId, query);
  }

  @Delete(':keyId')
  @RequirePermission('agent-api-key:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CaptureAuditLog(agentApiKeyAuditConfigs.revoke)
  @ApiOperation({ summary: '吊销 API Key（幂等）' })
  @ApiResponse({ status: 204, description: '已吊销' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'Key 不存在' })
  async revoke(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ): Promise<void> {
    await this.agentApiKeyService.revoke(agentId, keyId);
  }
}
