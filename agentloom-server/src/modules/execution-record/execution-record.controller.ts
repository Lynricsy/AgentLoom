import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DomainException } from '../../common/exceptions/domain.exception';
import { ExecutionRecordService } from './execution-record.service';
import {
  QueryExecutionRecordsDto,
  QueryExecutionRecordsSchema,
} from './dto/execution-record.dto';

@ApiTags('Execution Records')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('execution-records')
export class ExecutionRecordController {
  constructor(
    private readonly executionRecordService: ExecutionRecordService,
  ) {}

  @Get()
  @Roles('viewer', 'operator', 'creator', 'admin', 'owner')
  @ApiOperation({ summary: '查询 Agent 执行记录' })
  @ApiResponse({ status: 200, description: '执行记录查询成功' })
  @ApiResponse({ status: 400, description: '查询参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  async findByExecution(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryExecutionRecordsDto,
  ) {
    const parsed = QueryExecutionRecordsSchema.safeParse(query);

    if (!parsed.success) {
      throw new DomainException({
        type: 'validation-error',
        title: 'Invalid query parameters',
        status: 400,
        detail: 'The query parameters provided are invalid',
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return this.executionRecordService.findByExecution(tenantId, parsed.data);
  }
}
