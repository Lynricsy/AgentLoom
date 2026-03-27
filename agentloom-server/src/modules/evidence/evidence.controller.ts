import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

import { QueryEvidenceChainDto, QueryEvidenceDto } from './dto/evidence.dto';
import { EvidenceGraphService } from './evidence-graph.service';
import { EvidenceService } from './evidence.service';

@ApiTags('Evidence')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('executions/:executionId/evidence')
export class EvidenceController {
  constructor(
    private readonly evidenceService: EvidenceService,
    private readonly evidenceGraphService: EvidenceGraphService,
  ) {}

  @Get()
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '获取执行的证据记录列表' })
  @ApiParam({ name: 'executionId', description: '执行 ID' })
  @ApiResponse({ status: 200, description: '证据记录列表获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '执行不存在' })
  async findByExecution(
    @CurrentTenant() tenantId: string,
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Query() query: QueryEvidenceDto,
  ) {
    return this.evidenceService.findByExecution(tenantId, executionId, query);
  }

  @Get('graph')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '获取执行的证据关系图' })
  @ApiParam({ name: 'executionId', description: '执行 ID' })
  @ApiResponse({
    status: 200,
    description: '证据关系图获取成功，含 X-Cache-Hit 响应头',
  })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '执行不存在' })
  async getEvidenceGraph(
    @CurrentTenant() tenantId: string,
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { response, cached } = await this.evidenceGraphService.buildGraph(
      tenantId,
      executionId,
    );
    res.header('X-Cache-Hit', cached ? 'true' : 'false');
    return { data: response };
  }

  @Get('chain')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '获取执行的证据溯源链' })
  @ApiParam({ name: 'executionId', description: '执行 ID' })
  @ApiQuery({
    name: 'nodeId',
    required: false,
    description: '节点 ID，用于过滤特定节点的溯源链',
  })
  @ApiResponse({
    status: 200,
    description: '证据溯源链获取成功，含 X-Cache-Hit 响应头',
  })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '执行不存在' })
  async getEvidenceChain(
    @CurrentTenant() tenantId: string,
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Query() query: QueryEvidenceChainDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { response, cached } = await this.evidenceService.buildChain(
      tenantId,
      executionId,
      query.nodeId,
    );
    res.header('X-Cache-Hit', cached ? 'true' : 'false');
    return { data: response };
  }

  @Get(':evidenceId')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '获取单条证据记录详情' })
  @ApiParam({ name: 'executionId', description: '执行 ID' })
  @ApiParam({ name: 'evidenceId', description: '证据记录 ID' })
  @ApiResponse({ status: 200, description: '证据记录详情获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '证据记录不存在' })
  async findById(
    @CurrentTenant() tenantId: string,
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return {
      data: await this.evidenceService.findById(
        tenantId,
        executionId,
        evidenceId,
      ),
    };
  }

  @Get(':evidenceId/verify')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '校验证据内容哈希完整性' })
  @ApiParam({ name: 'executionId', description: '执行 ID' })
  @ApiParam({ name: 'evidenceId', description: '证据记录 ID' })
  @ApiResponse({ status: 200, description: '证据完整性校验结果' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '证据记录不存在' })
  async verifyContentHash(
    @CurrentTenant() tenantId: string,
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    const verification = await this.evidenceService.verifyContentHash(
      tenantId,
      executionId,
      evidenceId,
    );
    return { data: verification };
  }
}
