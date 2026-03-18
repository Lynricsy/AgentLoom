import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateEvidenceExportJobBodyDto } from './dto/evidence-export.dto';
import { EvidenceExportAccessGuard } from './evidence-export-access.guard';
import { EvidenceExportService } from './evidence-export.service';

@ApiTags('Evidence Exports')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@UseGuards(EvidenceExportAccessGuard)
@Controller('evidence-exports')
export class EvidenceExportController {
  constructor(private readonly evidenceExportService: EvidenceExportService) {}

  @Post()
  @ApiOperation({ summary: '创建证据导出任务' })
  @ApiResponse({ status: 201, description: '证据导出任务创建成功' })
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Body() body: CreateEvidenceExportJobBodyDto,
  ) {
    return {
      data: await this.evidenceExportService.requestExport({
        tenantId,
        actorId,
        filters: body.filters,
      }),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取证据导出任务详情' })
  @ApiParam({ name: 'id', description: '导出任务 ID' })
  @ApiResponse({ status: 200, description: '证据导出任务详情获取成功' })
  async findById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) exportId: string,
  ) {
    return {
      data: await this.evidenceExportService.findById(tenantId, exportId),
    };
  }

  @Get(':id/download')
  @ApiOperation({ summary: '获取证据导出任务下载详情' })
  @ApiParam({ name: 'id', description: '导出任务 ID' })
  @ApiResponse({ status: 200, description: '证据导出下载详情获取成功' })
  async getDownloadDetail(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id', ParseUUIDPipe) exportId: string,
  ) {
    return {
      data: await this.evidenceExportService.getDownloadDetail({
        tenantId,
        actorId,
        exportId,
      }),
    };
  }

  @Post(':id/download/refresh')
  @ApiOperation({ summary: '刷新证据导出任务下载详情' })
  @ApiParam({ name: 'id', description: '导出任务 ID' })
  @ApiResponse({ status: 200, description: '证据导出下载详情刷新成功' })
  async refreshDownloadDetail(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') actorId: string,
    @Param('id', ParseUUIDPipe) exportId: string,
  ) {
    return {
      data: await this.evidenceExportService.refreshDownloadDetail({
        tenantId,
        actorId,
        exportId,
      }),
    };
  }
}
