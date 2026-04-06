import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/guards/auth.guard';
import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { CreateWorkspaceSchema } from './dto/create-workspace.dto';
import { ListWorkspacesQueryDto } from './dto/list-workspaces-query.dto';
import type { UpdateWorkspaceTextFileDto } from './dto/update-workspace-text-file.dto';
import { UpdateWorkspaceTextFileSchema } from './dto/update-workspace-text-file.dto';
import { WorkspaceService } from './workspace.service';
import type { WorkspaceSnapshot } from '../../database/schema';
import { enrichWorkspaceSnapshot } from './workspace-source.utils';

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
    const organizationId = await this.getOrganizationId(req, tenantId);
    const description = dto.description ?? undefined;

    let data: WorkspaceSnapshot;
    if (dto.sandboxSessionId) {
      data = await this.workspaceService.createFromSandbox(
        tenantId,
        organizationId,
        req.user.sub,
        dto.sandboxSessionId,
        dto.name,
        description,
      );
    } else {
      data = await this.workspaceService.createEmpty(
        tenantId,
        organizationId,
        req.user.sub,
        dto.name,
        description,
      );
    }

    return { data: enrichWorkspaceSnapshot(data) };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'List workspace snapshots' })
  @ApiResponse({ status: 200, description: 'Workspace snapshot list' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListWorkspacesQueryDto,
  ) {
    const tenantId = this.getTenantId(req);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.workspaceService.findAll(tenantId, {
      page,
      pageSize,
      search: query.search,
      includeAutoArchived: query.includeAutoArchived,
    });

    return {
      data: result.data,
      meta: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  @Get(':id/tree')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'Get workspace file tree' })
  @ApiResponse({ status: 200, description: 'Workspace file tree' })
  @ApiResponse({ status: 404, description: 'Workspace snapshot not found' })
  async getFileTree(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.workspaceService.getFileTree(
      this.getTenantId(req),
      id,
    );
    return { data };
  }

  @Get(':id/preview/*')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'Get workspace file preview metadata' })
  @ApiParam({ name: 'id', description: 'Workspace snapshot UUID' })
  @ApiParam({ name: '*', description: 'Workspace file path' })
  @ApiResponse({ status: 200, description: 'Workspace file preview' })
  @ApiResponse({ status: 404, description: 'Workspace file not found' })
  async getFilePreview(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('*') filePath: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.workspaceService.getFilePreview(
      this.getTenantId(req),
      id,
      filePath,
    );
    return { data };
  }

  @Put(':id/files/*')
  @ApiOperation({ summary: 'Update workspace text file content' })
  @ApiParam({ name: 'id', description: 'Workspace snapshot UUID' })
  @ApiParam({ name: '*', description: 'Workspace file path' })
  @ApiResponse({ status: 200, description: 'Workspace text file updated' })
  @ApiResponse({ status: 400, description: 'Workspace file is not editable' })
  @ApiResponse({ status: 404, description: 'Workspace file not found' })
  async updateTextFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('*') filePath: string,
    @Body(new ZodValidationPipe(UpdateWorkspaceTextFileSchema))
    dto: UpdateWorkspaceTextFileDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!filePath) {
      throw new BadRequestException('文件路径不能为空');
    }

    const data = await this.workspaceService.updateTextFile(
      this.getTenantId(req),
      id,
      filePath,
      dto.content,
    );

    return { data };
  }

  @Get(':id/raw/*')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: 'Get raw workspace file bytes' })
  @ApiParam({ name: 'id', description: 'Workspace snapshot UUID' })
  @ApiParam({ name: '*', description: 'Workspace file path' })
  @ApiResponse({ status: 200, description: 'Workspace file stream' })
  @ApiResponse({ status: 404, description: 'Workspace file not found' })
  async getRawFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('*') filePath: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: false }) reply: any,
  ) {
    const asset = await this.workspaceService.getFileAsset(
      this.getTenantId(req),
      id,
      filePath,
    );

    reply.header(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(asset.fileName)}"`,
    );
    reply.header('Content-Length', String(asset.size));
    reply.type(asset.mimeType);
    return reply.send(asset.content);
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
    const data = await this.workspaceService.findOne(this.getTenantId(req), id);
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

  private async getOrganizationId(
    req: AuthenticatedRequest,
    tenantId: string,
  ): Promise<string> {
    const organizationId = req.user.orgId ?? req.user.org_id;

    if (organizationId) {
      return organizationId;
    }

    return this.workspaceService.resolveOrganizationId(tenantId);
  }
}
