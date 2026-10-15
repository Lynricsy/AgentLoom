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
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  ListTeamMessagesQueryDto,
  ListTeamRunsQueryDto,
  TeamMessageListResponseDto,
  TeamRunDetailResponseDto,
  TeamRunListResponseDto,
  type TeamMessageListResponse,
  type TeamRunDetailResponse,
  type TeamRunListResponse,
} from './dto/team-run.dto';
import { TeamRunQueryService } from './team-run-query.service';

@ApiTags('Team Runs')
@Controller('team-runs')
export class TeamController {
  constructor(private readonly queryService: TeamRunQueryService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('execution:read')
  @ApiOperation({ summary: '列出工作流执行中的团队运行' })
  @ApiResponse({
    status: 200,
    description: '团队运行列表（按创建时间倒序）',
    type: TeamRunListResponseDto,
  })
  async listTeamRuns(
    @CurrentTenant() tenantId: string,
    @Query() query: ListTeamRunsQueryDto,
  ): Promise<TeamRunListResponse> {
    return {
      data: await this.queryService.listByExecution(
        tenantId,
        query.executionId,
      ),
    };
  }

  @Get(':teamRunId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('execution:read')
  @ApiOperation({ summary: '获取团队运行详情' })
  @ApiResponse({
    status: 200,
    description: '团队运行详情',
    type: TeamRunDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: '团队运行不存在' })
  async getTeamRun(
    @CurrentTenant() tenantId: string,
    @Param('teamRunId', ParseUUIDPipe) teamRunId: string,
  ): Promise<TeamRunDetailResponse> {
    return { data: await this.queryService.getDetail(tenantId, teamRunId) };
  }

  @Get(':teamRunId/messages')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('execution:read')
  @ApiOperation({ summary: '分页列出团队消息（按创建时间升序）' })
  @ApiResponse({
    status: 200,
    description: '团队消息分页',
    type: TeamMessageListResponseDto,
  })
  @ApiResponse({ status: 404, description: '团队运行不存在' })
  async listTeamMessages(
    @CurrentTenant() tenantId: string,
    @Param('teamRunId', ParseUUIDPipe) teamRunId: string,
    @Query() query: ListTeamMessagesQueryDto,
  ): Promise<TeamMessageListResponse> {
    return this.queryService.listMessages(
      tenantId,
      teamRunId,
      query.page,
      query.limit,
    );
  }
}
