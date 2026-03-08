import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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

  @Get('tools')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'List tool definitions' })
  @ApiQuery({ name: 'source', required: false, enum: ['mcp', 'builtin', 'custom'] })
  async listTools(
    @CurrentTenant() tenantId: string,
    @Query('source') source?: string,
  ) {
    const result = await this.mcpService.listTools(tenantId, source);
    return { data: result };
  }
}
