import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  MonitoringDashboardEnvelopeDto,
  type MonitoringDashboardDto,
} from './dto/monitoring-dashboard.dto';
import {
  QueryMonitoringDashboardDto,
  type QueryMonitoringDashboardInput,
} from './dto/query-monitoring-dashboard.dto';
import { MonitoringService } from './monitoring.service';

@ApiTags('Monitoring')
@Controller()
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('organizations/:id/monitoring')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '获取当前组织的只读运行监控仪表板' })
  @ApiResponse({
    status: 200,
    description: '组织级只读监控仪表板',
    type: MonitoringDashboardEnvelopeDto,
  })
  async getDashboard(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Query() query: QueryMonitoringDashboardDto,
  ): Promise<{ data: MonitoringDashboardDto }> {
    const dashboard = await this.monitoringService.getDashboard({
      organizationId,
      tenantId,
      userId,
      window: (query as QueryMonitoringDashboardInput).window,
    });

    return { data: dashboard };
  }
}
