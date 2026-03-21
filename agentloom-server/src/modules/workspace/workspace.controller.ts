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
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { CreateWorkspaceSchema } from './dto/create-workspace.dto';
import { WorkspaceService } from './workspace.service';
import type { WorkspaceSnapshot } from '../../database/schema';

type AuthenticatedRequest = FastifyRequest & {
  tenantId?: string;
  user: JwtPayload;
};

@ApiTags('Workspaces')
@Controller('workspaces')
@Roles('owner', 'admin', 'creator', 'operator')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create workspace snapshot' })
  @ApiResponse({ status: 201, description: 'Workspace snapshot created' })
  @ApiResponse({ status: 404, description: 'Sandbox session not found' })
  async create(
    @Body(new ZodValidationPipe(CreateWorkspaceSchema)) dto: CreateWorkspaceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = this.getTenantId(req);
    const organizationId = tenantId;

    let data: WorkspaceSnapshot;
    if (dto.sandboxSessionId) {
      data = await this.workspaceService.createFromSandbox(
        tenantId,
        organizationId,
        req.user.sub,
        dto.sandboxSessionId,
        dto.name,
        dto.description,
      );
    } else {
      data = await this.workspaceService.createEmpty(
        tenantId,
        organizationId,
        req.user.sub,
        dto.name,
        dto.description,
      );
    }

    return { data };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'List workspace snapshots' })
  @ApiResponse({ status: 200, description: 'Workspace snapshot list' })
  async list(@Req() req: AuthenticatedRequest) {
    const data = await this.workspaceService.findAll(this.getTenantId(req));
    return { data };
  }

  @Get(':id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'Get workspace snapshot detail' })
  @ApiResponse({ status: 200, description: 'Workspace snapshot detail' })
  @ApiResponse({ status: 404, description: 'Workspace snapshot not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.workspaceService.findOne(
      this.getTenantId(req),
      id,
    );
    return { data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete workspace snapshot' })
  @ApiResponse({ status: 204, description: 'Workspace snapshot deleted' })
  @ApiResponse({ status: 404, description: 'Workspace snapshot not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.workspaceService.delete(this.getTenantId(req), id);
  }

  private getTenantId(req: AuthenticatedRequest): string {
    const tenantId = req.tenantId ?? req.user.tenantId;

    if (!tenantId) {
      throw new TenantRequiredException();
    }

    return tenantId;
  }
}
