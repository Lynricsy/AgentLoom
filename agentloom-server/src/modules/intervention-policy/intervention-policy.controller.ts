import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { InterventionPolicyService } from './intervention-policy.service';

@ApiTags('Intervention Policies')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('workflow-definitions/:workflowId/intervention-policies')
export class InterventionPolicyController {
  constructor(
    private readonly interventionPolicyService: InterventionPolicyService,
  ) {}

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取工作流的介入策略列表' })
  @ApiParam({ name: 'workflowId', description: '工作流 ID', type: String })
  @ApiQuery({ name: 'page', required: false, description: '页码（默认 1）', type: Number })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页数量（默认 20）', type: Number })
  @ApiResponse({ status: 200, description: '介入策略列表获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '工作流不存在' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.interventionPolicyService.findAll(
      tenantId,
      workflowId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get('resolve')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '解析工作流的有效介入策略' })
  @ApiParam({ name: 'workflowId', description: '工作流 ID', type: String })
  @ApiQuery({ name: 'nodeId', required: false, description: '节点 ID，用于获取节点级策略', type: String })
  @ApiResponse({ status: 200, description: '解析的介入策略返回成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '工作流不存在' })
  async resolvePolicy(
    @CurrentTenant() tenantId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Query('nodeId') nodeId?: string,
  ) {
    const resolved = await this.interventionPolicyService.resolvePolicy(
      tenantId,
      workflowId,
      nodeId,
    );
    return { data: resolved };
  }

  @Get(':policyId')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '根据 ID 获取介入策略详情' })
  @ApiParam({ name: 'workflowId', description: '工作流 ID', type: String })
  @ApiParam({ name: 'policyId', description: '介入策略 ID', type: String })
  @ApiResponse({ status: 200, description: '介入策略详情获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '介入策略不存在' })
  async findById(
    @CurrentTenant() tenantId: string,
    @Param('policyId', ParseUUIDPipe) policyId: string,
  ) {
    const policy = await this.interventionPolicyService.findById(
      tenantId,
      policyId,
    );
    return { data: policy };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '创建工作流介入策略' })
  @ApiParam({ name: 'workflowId', description: '工作流 ID', type: String })
  @ApiResponse({ status: 201, description: '介入策略创建成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '工作流不存在' })
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const policy = await this.interventionPolicyService.create(tenantId, userId, {
      ...body,
      workflowId,
    });
    return { data: policy };
  }

  @Patch(':policyId')
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '更新介入策略' })
  @ApiParam({ name: 'workflowId', description: '工作流 ID', type: String })
  @ApiParam({ name: 'policyId', description: '介入策略 ID', type: String })
  @ApiResponse({ status: 200, description: '介入策略更新成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '介入策略不存在' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const policy = await this.interventionPolicyService.update(
      tenantId,
      policyId,
      body,
    );
    return { data: policy };
  }

  @Delete(':policyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: '删除介入策略' })
  @ApiParam({ name: 'workflowId', description: '工作流 ID', type: String })
  @ApiParam({ name: 'policyId', description: '介入策略 ID', type: String })
  @ApiResponse({ status: 204, description: '介入策略删除成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '介入策略不存在' })
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('policyId', ParseUUIDPipe) policyId: string,
  ) {
    await this.interventionPolicyService.remove(tenantId, policyId);
  }
}
