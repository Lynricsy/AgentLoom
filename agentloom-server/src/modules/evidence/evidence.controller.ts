import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

import { QueryEvidenceDto } from './dto/evidence.dto';
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
    return this.evidenceService.findByExecution(
      tenantId,
      executionId,
      query,
    );
  }

  @Get(':evidenceId')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  async findById(
    @CurrentTenant() tenantId: string,
    @Param('executionId', ParseUUIDPipe) _executionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return {
      data: await this.evidenceService.findById(tenantId, evidenceId),
    };
  }

  @Get(':evidenceId/verify')
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  async verifyContentHash(
    @CurrentTenant() tenantId: string,
    @Param('executionId', ParseUUIDPipe) _executionId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    const valid = await this.evidenceService.verifyContentHash(
      tenantId,
      evidenceId,
    );
    return { data: { evidenceId, valid } };
  }
}
