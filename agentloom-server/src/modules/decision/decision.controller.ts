import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DecisionService } from './decision.service';
import {
  DecisionRecordListResponseDto,
  ListDecisionRecordsQueryDto,
  type DecisionRecordListResponse,
} from './dto/decision-record.dto';

@ApiTags('decision')
@Controller('decision-records')
export class DecisionController {
  constructor(private readonly decisionService: DecisionService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('execution:read')
  @ApiOperation({ summary: '查询决策记录（规则主结果与 Jev 影子结果）' })
  @ApiResponse({
    status: 200,
    description: '按创建时间倒序分页的决策记录',
    type: DecisionRecordListResponseDto,
  })
  listDecisionRecords(
    @CurrentTenant() tenantId: string,
    @Query() query: ListDecisionRecordsQueryDto,
  ): Promise<DecisionRecordListResponse> {
    return this.decisionService.listRecords(tenantId, query);
  }
}
