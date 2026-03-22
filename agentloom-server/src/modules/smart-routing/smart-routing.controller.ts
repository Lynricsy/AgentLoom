import { Controller, Get, HttpCode, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SmartRoutingService } from './smart-routing.service';
import { ProviderHealthStatusesResponseDto } from './dto/provider-health.dto';
import {
  QueryRoutingDecisionsSchema,
  type QueryRoutingDecisionsDto,
} from './dto/query-routing-decisions.dto';
import {
  SmartRoutingStrategiesResponseDto,
  SmartRoutingStrategyConfigSchemaResponseDto,
} from './dto/smart-routing-strategies.dto';

@ApiTags('smart-routing')
@Controller()
export class SmartRoutingController {
  constructor(private readonly smartRoutingService: SmartRoutingService) {}

  @Get('smart-routing/strategies')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取已注册的 Smart Routing 策略列表' })
  @ApiResponse({
    status: 200,
    description: '已注册的 Smart Routing 策略列表',
    type: SmartRoutingStrategiesResponseDto,
  })
  getStrategies() {
    return this.smartRoutingService.listStrategies();
  }

  @Get('smart-routing/health')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取当前租户的路由提供商健康状态' })
  @ApiResponse({
    status: 200,
    description: '当前租户的路由提供商健康状态',
    type: ProviderHealthStatusesResponseDto,
  })
  getProviderHealth(@CurrentTenant() tenantId: string) {
    return this.smartRoutingService.getProviderHealthStatuses(tenantId);
  }

  @Get('smart-routing/strategies/:name/config-schema')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取指定 Smart Routing 策略的配置 JSON Schema' })
  @ApiResponse({
    status: 200,
    description: '指定策略的配置 JSON Schema',
    type: SmartRoutingStrategyConfigSchemaResponseDto,
  })
  getStrategyConfigSchema(@Param('name') name: string) {
    return this.smartRoutingService.getStrategyConfigSchema(name);
  }

  @Get('routing-decisions')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查询 Smart Routing 决策记录' })
  async findRoutingDecisions(
    @CurrentTenant() tenantId: string,
    @Query(new ZodValidationPipe(QueryRoutingDecisionsSchema))
    query: QueryRoutingDecisionsDto,
  ) {
    return this.smartRoutingService.findByExecution(tenantId, query);
  }
}
