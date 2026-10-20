import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';

import {
  ApiEventIngestionService,
  IngestEventSchema,
  type IngestionResult,
} from './api-event-ingestion.service';

type AuthenticatedRequest = {
  tenantId: string;
};

@ApiTags('Triggers')
@Controller('api-events')
export class ApiEventIngestionController {
  private readonly logger = new Logger(ApiEventIngestionController.name);

  constructor(private readonly ingestionService: ApiEventIngestionService) {}

  // 事件会以系统身份启动本租户的工作流：与手动启动同权限，并由 RolesGuard 实时校验成员身份
  @Post()
  @RequirePermission('workflow:run')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '触发 api_event 工作流' })
  @ApiResponse({ status: 202, description: '事件已接受处理' })
  @ApiResponse({ status: 400, description: '无效的事件载荷或缺少租户上下文' })
  @ApiResponse({ status: 403, description: '不是该组织成员或角色不足' })
  async ingestEvent(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<IngestionResult> {
    const dto = IngestEventSchema.parse(body);
    return this.ingestionService.ingestEvent(request.tenantId, dto);
  }
}
