import {
  Body,
  Controller,
  Get,
  Param,
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
    const { data, total } = await this.knowledgeBaseService.findAllByTenant(
      tenantId,
      query.page,
      query.pageSize,
    );
    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  @Post(':id/documents')
  @Roles('owner', 'admin', 'creator', 'operator')
  async uploadDocument(
    @Param('id') knowledgeBaseId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') userId: string,
    @Req() request: FastifyRequest,
  ) {
    await this.knowledgeBaseService.findByIdOrThrow(
      knowledgeBaseId,
      tenantId,
    );

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
    await this.knowledgeBaseService.findByIdOrThrow(
      knowledgeBaseId,
      tenantId,
    );

    const { data, total } = await this.documentService.findByKnowledgeBase(
      knowledgeBaseId,
      tenantId,
      query.page,
      query.pageSize,
      query.status,
    );

    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }
}
