import {
  Body,
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
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  DiscoverMcpToolsDto,
  ImportMcpToolsDto,
  McpServerConfigQuerySchema,
  type McpServerConfigQueryType,
  ReimportMcpToolsDto,
  TestMcpConnectionDto,
  UpdateMcpServerConfigSchema,
  type UpdateMcpServerConfigType,
} from './dto';
import { McpService } from './mcp.service';

@ApiTags('MCP')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '测试 MCP 服务器连接' })
  @ApiResponse({ status: 200, description: '连接测试成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  async testConnection(@Body() dto: TestMcpConnectionDto) {
    const result = await this.mcpService.testConnection(dto);
    return { data: result };
  }

  @Post('discover')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '从 MCP 服务器发现工具列表' })
  @ApiResponse({ status: 200, description: '工具发现成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  async discoverTools(@Body() dto: DiscoverMcpToolsDto) {
    const result = await this.mcpService.discoverTools(dto);
    return { data: result };
  }

  @Post('import')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '从 MCP 服务器导入工具' })
  @ApiResponse({ status: 201, description: '工具导入成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  async importTools(
    @Body() dto: ImportMcpToolsDto,
    @CurrentUser('sub') userId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const result = await this.mcpService.importTools(dto, userId, tenantId);
    return { data: result };
  }

  @Post('configs/:mcpServerConfigId/test')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '测试已保存的 MCP 服务器配置连接' })
  @ApiParam({ name: 'mcpServerConfigId', description: 'MCP 服务器配置 ID' })
  @ApiResponse({ status: 200, description: '连接测试成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'MCP 服务器配置不存在' })
  async testSavedConfigConnection(
    @Param('mcpServerConfigId') mcpServerConfigId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const result = await this.mcpService.testSavedConfigConnection(
      mcpServerConfigId,
      tenantId,
    );
    return { data: result };
  }

  @Post('configs/:mcpServerConfigId/rediscover')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '重新从已保存的 MCP 服务器配置发现工具' })
  @ApiParam({ name: 'mcpServerConfigId', description: 'MCP 服务器配置 ID' })
  @ApiResponse({ status: 200, description: '工具重新发现成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'MCP 服务器配置不存在' })
  async rediscoverTools(
    @Param('mcpServerConfigId') mcpServerConfigId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const result = await this.mcpService.rediscoverTools(
      mcpServerConfigId,
      tenantId,
    );
    return { data: result };
  }

  @Post('configs/:mcpServerConfigId/reimport')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '重新从已保存的 MCP 服务器配置导入工具' })
  @ApiParam({ name: 'mcpServerConfigId', description: 'MCP 服务器配置 ID' })
  @ApiResponse({ status: 201, description: '工具重新导入成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'MCP 服务器配置不存在' })
  async reimportTools(
    @Param('mcpServerConfigId') mcpServerConfigId: string,
    @Body() dto: ReimportMcpToolsDto,
    @CurrentTenant() tenantId: string,
  ) {
    const result = await this.mcpService.reimportTools(
      mcpServerConfigId,
      dto,
      tenantId,
    );
    return { data: result };
  }

  @Post('tools/:toolDefinitionId/deactivate')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '停用已导入的 MCP 工具' })
  @ApiParam({ name: 'toolDefinitionId', description: '工具定义 ID' })
  @ApiResponse({ status: 201, description: '工具停用成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '工具定义不存在' })
  async deactivateTool(
    @Param('toolDefinitionId') toolDefinitionId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const result = await this.mcpService.deactivateTool(
      toolDefinitionId,
      tenantId,
    );
    return { data: result };
  }

  @Get('tools')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '获取工具定义列表' })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['mcp', 'builtin', 'custom'],
    description: '工具来源过滤',
  })
  @ApiResponse({ status: 200, description: '工具列表获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  async listTools(
    @CurrentTenant() tenantId: string,
    @Query('source') source?: string,
  ) {
    const result = await this.mcpService.listTools(tenantId, source);
    return { data: result };
  }

  @Get('configs')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '分页查询已保存的 MCP 服务器配置列表' })
  @ApiResponse({ status: 200, description: 'MCP 服务器配置列表' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  async listConfigs(
    @CurrentTenant() tenantId: string,
    @Query(new ZodValidationPipe(McpServerConfigQuerySchema))
    query: McpServerConfigQueryType,
  ) {
    return await this.mcpService.findAllConfigs(tenantId, query);
  }

  @Get('configs/:id')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '获取 MCP 服务器配置详情（含工具列表）' })
  @ApiParam({ name: 'id', description: 'MCP 服务器配置 ID' })
  @ApiResponse({ status: 200, description: 'MCP 服务器配置详情' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'MCP 服务器配置不存在' })
  async getConfig(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.mcpService.findConfigById(tenantId, id);
    return { data: result };
  }

  @Patch('configs/:id')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新 MCP 服务器配置元数据' })
  @ApiParam({ name: 'id', description: 'MCP 服务器配置 ID' })
  @ApiResponse({ status: 200, description: 'MCP 服务器配置更新成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'MCP 服务器配置不存在' })
  async updateConfig(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateMcpServerConfigSchema))
    data: UpdateMcpServerConfigType,
  ) {
    const result = await this.mcpService.updateConfig(tenantId, id, data);
    return { data: result };
  }

  @Delete('configs/:id')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除 MCP 服务器配置' })
  @ApiParam({ name: 'id', description: 'MCP 服务器配置 ID' })
  @ApiResponse({ status: 204, description: 'MCP 服务器配置已删除' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: 'MCP 服务器配置不存在' })
  async deleteConfig(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.mcpService.deleteConfig(tenantId, id);
  }
}
