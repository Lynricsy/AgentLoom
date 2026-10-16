import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  AnalyzeResponseDto,
  AnalyzeWorkflowDto,
  ListProposalsQueryDto,
  ProposalDetailResponseDto,
  ProposalListResponseDto,
  PublishProposalDto,
  StartEvaluationDto,
  type AnalyzeResponse,
  type ProposalDetailResponse,
  type ProposalListResponse,
} from './dto/optimization-proposal.dto';
import { OptimizationProposalService } from './optimization-proposal.service';

@ApiTags('Optimization Proposals')
@Controller('optimization-proposals')
export class OptimizationProposalController {
  constructor(private readonly proposalService: OptimizationProposalService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('workflow:read')
  @ApiOperation({ summary: '列出优化提案（按创建时间倒序）' })
  @ApiResponse({ status: 200, type: ProposalListResponseDto })
  async list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListProposalsQueryDto,
  ): Promise<ProposalListResponse> {
    return this.proposalService.list(tenantId, query);
  }

  @Post('analyze')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('workflow:manage')
  @ApiOperation({ summary: '按运行证据分析工作流，返回新建的优化提案' })
  @ApiResponse({ status: 201, type: AnalyzeResponseDto })
  @ApiResponse({ status: 422, description: '工作流未发布或没有可分析节点' })
  async analyze(
    @CurrentTenant() tenantId: string,
    @Body() dto: AnalyzeWorkflowDto,
  ): Promise<AnalyzeResponse> {
    return {
      data: await this.proposalService.analyzeWorkflow(
        tenantId,
        dto.workflowDefinitionId,
      ),
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('workflow:read')
  @ApiOperation({ summary: '获取优化提案详情（含最近一次评测）' })
  @ApiResponse({ status: 200, type: ProposalDetailResponseDto })
  @ApiResponse({ status: 404, description: '优化提案不存在' })
  async getDetail(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProposalDetailResponse> {
    return { data: await this.proposalService.getDetail(tenantId, id) };
  }

  @Post(':id/evaluate')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('workflow:manage')
  @ApiOperation({ summary: '启动评测：基线与候选版本回放最近的真实输入' })
  @ApiResponse({ status: 202, type: ProposalDetailResponseDto })
  @ApiResponse({ status: 409, description: '状态不允许或提案已失效' })
  @ApiResponse({ status: 422, description: '没有可回放的用例或补丁无效' })
  async evaluate(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartEvaluationDto,
  ): Promise<ProposalDetailResponse> {
    return {
      data: await this.proposalService.startEvaluation(
        tenantId,
        id,
        userId,
        dto,
      ),
    };
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('workflow:manage')
  @ApiOperation({ summary: '发布评测优于基线的候选版本' })
  @ApiResponse({ status: 200, type: ProposalDetailResponseDto })
  @ApiResponse({ status: 409, description: '状态不允许或提案已失效' })
  @ApiResponse({ status: 422, description: '评测结论不是优于基线' })
  async publish(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishProposalDto,
  ): Promise<ProposalDetailResponse> {
    return {
      data: await this.proposalService.publish(tenantId, id, userId, dto),
    };
  }

  @Post(':id/rollback')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('workflow:manage')
  @ApiOperation({ summary: '回滚已发布的提案：重新发布基线版本' })
  @ApiResponse({ status: 200, type: ProposalDetailResponseDto })
  @ApiResponse({ status: 409, description: '状态不允许或发布版本已变化' })
  async rollback(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProposalDetailResponse> {
    return { data: await this.proposalService.rollback(tenantId, id, userId) };
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('workflow:manage')
  @ApiOperation({ summary: '忽略优化提案' })
  @ApiResponse({ status: 200, type: ProposalDetailResponseDto })
  @ApiResponse({ status: 409, description: '状态不允许' })
  async dismiss(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProposalDetailResponse> {
    return { data: await this.proposalService.dismiss(tenantId, id, userId) };
  }
}
