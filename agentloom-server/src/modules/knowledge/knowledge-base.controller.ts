import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';
import { DocumentService } from './document.service';
import {
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseSettingsDto,
  ListKnowledgeBasesQueryDto,
  ListDocumentsQueryDto,
} from './dto';

@Controller('knowledge-bases')
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly documentService: DocumentService,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'creator', 'operator')
  async create(
    @Body() dto: CreateKnowledgeBaseDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const knowledgeBase = await this.knowledgeBaseService.create(
      dto,
      tenantId,
      userId,
    );
    return { data: knowledgeBase };
  }

  @Get()
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  async findAll(
    @Query() query: ListKnowledgeBasesQueryDto,
    @CurrentTenant() tenantId: string,
  ) {
    const { data, total } =
      await this.knowledgeBaseService.findSummariesByTenant(
        tenantId,
        query.page,
        query.pageSize,
      );
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  @Get(':id')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  async findOne(
    @Param('id') knowledgeBaseId: string,
    @CurrentTenant() tenantId: string,
  ) {
    const knowledgeBase =
      await this.knowledgeBaseService.findSummaryByIdOrThrow(
        knowledgeBaseId,
        tenantId,
      );

    return { data: knowledgeBase };
  }

  @Post(':id/documents')
  @Roles('owner', 'admin', 'creator', 'operator')
  async uploadDocument(
    @Param('id') knowledgeBaseId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Req() request: FastifyRequest,
  ) {
    await this.knowledgeBaseService.findByIdOrThrow(knowledgeBaseId, tenantId);

    const document = await this.documentService.uploadFromRequest(
      request,
      knowledgeBaseId,
      tenantId,
      userId,
    );

    return { data: document };
  }

  @Get(':id/documents')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  async listDocuments(
    @Param('id') knowledgeBaseId: string,
    @Query() query: ListDocumentsQueryDto,
    @CurrentTenant() tenantId: string,
  ) {
    await this.knowledgeBaseService.findByIdOrThrow(knowledgeBaseId, tenantId);

    const { data, total } = await this.documentService.findByKnowledgeBase(
      knowledgeBaseId,
      tenantId,
      query.page,
      query.pageSize,
      query.status,
    );

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('owner', 'admin', 'creator', 'operator')
  async deleteKnowledgeBase(
    @Param('id') knowledgeBaseId: string,
    @CurrentTenant() tenantId: string,
  ) {
    await this.knowledgeBaseService.findByIdOrThrow(knowledgeBaseId, tenantId);
    await this.documentService.deleteByKnowledgeBase(knowledgeBaseId, tenantId);
    await this.knowledgeBaseService.delete(knowledgeBaseId, tenantId);
  }

  @Patch(':id/settings')
  @Roles('owner', 'admin', 'creator', 'operator')
  async updateSettings(
    @Param('id') knowledgeBaseId: string,
    @Body() dto: UpdateKnowledgeBaseSettingsDto,
    @CurrentTenant() tenantId: string,
  ) {
    const knowledgeBase = await this.knowledgeBaseService.updateSettings(
      knowledgeBaseId,
      tenantId,
      dto,
    );
    return { data: knowledgeBase };
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('owner', 'admin', 'creator', 'operator')
  async deleteDocument(
    @Param('id') knowledgeBaseId: string,
    @Param('documentId') documentId: string,
    @CurrentTenant() tenantId: string,
  ) {
    await this.knowledgeBaseService.findByIdOrThrow(knowledgeBaseId, tenantId);
    await this.documentService.deleteDocument(
      knowledgeBaseId,
      documentId,
      tenantId,
    );
  }
}
