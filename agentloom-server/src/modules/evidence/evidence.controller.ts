import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

import { QueryEvidenceChainDto, QueryEvidenceDto } from './dto/evidence.dto';
import { EvidenceService } from './evidence.service';

@ApiTags('Evidence')
@Controller('executions/:executionId/evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Get()
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  async findByExecution(
    @CurrentTenant() tenantId: string,
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Query() query: QueryEvidenceDto,
  ) {
    return this.evidenceService.findByExecution(tenantId, executionId, query);
  }

  @Get('chain')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
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
