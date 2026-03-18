import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ListAuditLogsQueryDto } from './dto/audit-log.dto';
import { AuditLogService } from './audit-log.service';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Roles('owner', 'admin')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: '获取组织级审计日志列表' })
  @ApiResponse({ status: 200, description: '审计日志列表获取成功' })
  async list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListAuditLogsQueryDto,
  ) {
    const { data, total } = await this.auditLogService.list(tenantId, query);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  @Get('resources/:resourceType/:resourceId/sequence')
  @ApiOperation({ summary: '获取资源维度的审计时序' })
  @ApiParam({ name: 'resourceType', description: '资源类型' })
  @ApiParam({ name: 'resourceId', description: '资源 ID' })
  @ApiResponse({ status: 200, description: '资源审计时序获取成功' })
  async findResourceSequence(
    @CurrentTenant() tenantId: string,
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
  ) {
    return {
      data: await this.auditLogService.findResourceSequence(
        tenantId,
        resourceType,
        resourceId,
      ),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单条审计日志详情' })
  @ApiParam({ name: 'id', description: '审计日志 ID' })
  @ApiResponse({ status: 200, description: '审计日志详情获取成功' })
  @ApiResponse({ status: 404, description: '审计日志不存在' })
  async findById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.auditLogService.findById(tenantId, id),
    };
  }
}
