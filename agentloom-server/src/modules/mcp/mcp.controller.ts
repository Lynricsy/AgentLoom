import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  DiscoverMcpToolsDto,
  ImportMcpToolsDto,
  ReimportMcpToolsDto,
  TestMcpConnectionDto,
} from './dto';
import { McpService } from './mcp.service';

@ApiTags('MCP')
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Test MCP server connection' })
  async testConnection(@Body() dto: TestMcpConnectionDto) {
    const result = await this.mcpService.testConnection(dto);
    return { data: result };
  }

  @Post('discover')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Discover tools from MCP server' })
  async discoverTools(@Body() dto: DiscoverMcpToolsDto) {
    const result = await this.mcpService.discoverTools(dto);
    return { data: result };
  }

  @Post('import')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Import tools from MCP server' })
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
  @ApiOperation({ summary: 'Test a saved MCP server config connection' })
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
  @ApiOperation({ summary: 'Rediscover tools from a saved MCP server config' })
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
  @ApiOperation({ summary: 'Re-import tools from a saved MCP server config' })
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
  @ApiOperation({ summary: 'Deactivate an imported MCP tool' })
  async deactivateTool(
    @Param('toolDefinitionId') toolDefinitionId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const result = await this.mcpService.deactivateTool(toolDefinitionId, tenantId);
    return { data: result };
  }

  @Get('tools')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'List tool definitions' })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['mcp', 'builtin', 'custom'],
  })
  async listTools(
    @CurrentTenant() tenantId: string,
    @Query('source') source?: string,
  ) {
    const result = await this.mcpService.listTools(tenantId, source);
    return { data: result };
  }
}
