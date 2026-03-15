import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SmartRoutingService } from './smart-routing.service';
import {
  QueryRoutingDecisionsSchema,
  type QueryRoutingDecisionsDto,
} from './dto/query-routing-decisions.dto';

@ApiTags('Smart Routing')
@Controller('routing-decisions')
export class SmartRoutingController {
  constructor(private readonly smartRoutingService: SmartRoutingService) {}

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  async findRoutingDecisions(
    @CurrentTenant() tenantId: string,
    @Query(new ZodValidationPipe(QueryRoutingDecisionsSchema))
    query: QueryRoutingDecisionsDto,
  ) {
    return this.smartRoutingService.findByExecution(tenantId, query);
  }
}
