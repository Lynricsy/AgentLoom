import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { SandboxService } from './sandbox.service';
import {
  createSandboxSchema,
  CreateSandboxDto,
  ListSandboxesQueryDto,
} from './dto';

@ApiTags('Sandboxes')
@Controller()
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Get('sandboxes')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'List all sandbox sessions' })
  @ApiResponse({ status: 200, description: 'Paginated sandbox list' })
  async listSandboxes(
    @CurrentTenant() tenantId: string,
    @Query() query: ListSandboxesQueryDto,
  ) {
    const result = await this.sandboxService.listSandboxes(tenantId, query);
    return { data: result.data, meta: result.meta };
  }

  @Post('sandboxes')
  @HttpCode(HttpStatus.CREATED)
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: 'Create a persistent sandbox' })
  @ApiResponse({ status: 201, description: 'Persistent sandbox created' })
  async createSandbox(
    @CurrentTenant() tenantId: string,
    @Body(new ZodValidationPipe(createSandboxSchema)) dto: CreateSandboxDto,
  ) {
    const data = await this.sandboxService.createPersistentSandbox(
      tenantId,
      dto,
    );
    return { data };
  }

  @Get('sandboxes/:sessionId/stats')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'Get sandbox container resource stats' })
  @ApiResponse({ status: 200, description: 'Container resource usage stats' })
  async getStats(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    const data = await this.sandboxService.getContainerStats(sessionId);
    return { data };
  }

  @Post('sandboxes/:sessionId/stop')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: 'Stop a sandbox' })
  @ApiResponse({ status: 200, description: 'Sandbox stop initiated' })
  async stopSandbox(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.sandboxService.stopSandbox(sessionId, tenantId);
    return { data };
  }

  @Post('sandboxes/:sessionId/start')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: 'Start a stopped persistent sandbox' })
  @ApiResponse({ status: 200, description: 'Sandbox start initiated' })
  async startSandbox(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const data = await this.sandboxService.startSandbox(sessionId, tenantId);
    return { data };
  }

  @Delete('sandboxes/:sessionId')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator')
  @ApiOperation({ summary: 'Delete a persistent sandbox' })
  @ApiResponse({ status: 200, description: 'Persistent sandbox deleted' })
  async deleteSandbox(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentTenant() tenantId: string,
  ) {
    await this.sandboxService.deleteSandbox(sessionId, tenantId);
    return { data: { deleted: true } };
  }

  @Get('sandboxes/:sessionId/logs')
  @HttpCode(HttpStatus.OK)
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'Get sandbox logs' })
  @ApiResponse({ status: 200, description: 'Sandbox log list' })
  async getSandboxLogs(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    const logs = await this.sandboxService.getSandboxLogs(sessionId);
    return { data: logs };
  }
}
