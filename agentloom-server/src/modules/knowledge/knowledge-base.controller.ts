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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';
import { DocumentService } from './document.service';
import { KnowledgeGateway } from './knowledge.gateway';
import {
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseSettingsDto,
  ListKnowledgeBasesQueryDto,
  ListDocumentsQueryDto,
} from './dto';

@ApiTags('Knowledge Bases')
@ApiBearerAuth()
@ApiSecurity('X-Api-Key')
@Controller('knowledge-bases')
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly documentService: DocumentService,
    private readonly knowledgeGateway: KnowledgeGateway,
  ) {}

  @Post()
  @Roles('owner', 'admin', 'creator', 'operator')
  @ApiOperation({ summary: '创建新的知识库' })
  @ApiResponse({ status: 201, description: '知识库创建成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
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
  @ApiOperation({ summary: '获取当前租户的知识库列表' })
  @ApiResponse({ status: 200, description: '知识库列表获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
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
  @ApiOperation({ summary: '根据 ID 获取知识库详情' })
  @ApiParam({ name: 'id', description: '知识库 ID', type: String })
  @ApiResponse({ status: 200, description: '知识库详情获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '知识库不存在' })
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
  @ApiOperation({ summary: '向知识库上传文档' })
  @ApiParam({ name: 'id', description: '知识库 ID', type: String })
  @ApiResponse({ status: 201, description: '文档上传成功，已加入处理队列' })
  @ApiResponse({ status: 400, description: '文件格式不支持或请求无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '知识库不存在' })
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
  @ApiOperation({ summary: '获取知识库中的文档列表' })
  @ApiParam({ name: 'id', description: '知识库 ID', type: String })
  @ApiResponse({ status: 200, description: '文档列表获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '知识库不存在' })
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
  @ApiOperation({ summary: '删除知识库及其所有文档' })
  @ApiParam({ name: 'id', description: '知识库 ID', type: String })
  @ApiResponse({ status: 204, description: '知识库删除成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '知识库不存在' })
  async deleteKnowledgeBase(
    @Param('id') knowledgeBaseId: string,
    @CurrentTenant() tenantId: string,
  ) {
    await this.knowledgeBaseService.findByIdOrThrow(knowledgeBaseId, tenantId);
    await this.documentService.deleteByKnowledgeBase(knowledgeBaseId, tenantId);
    await this.knowledgeBaseService.delete(knowledgeBaseId, tenantId);
    this.knowledgeGateway.emitKnowledgeBaseUpdated(tenantId, knowledgeBaseId);
  }

  @Patch(':id/settings')
  @Roles('owner', 'admin', 'creator', 'operator')
  @ApiOperation({ summary: '更新知识库设置' })
  @ApiParam({ name: 'id', description: '知识库 ID', type: String })
  @ApiResponse({ status: 200, description: '知识库设置更新成功' })
  @ApiResponse({ status: 400, description: '请求参数无效' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '知识库不存在' })
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
  @ApiOperation({ summary: '删除知识库中的指定文档' })
  @ApiParam({ name: 'id', description: '知识库 ID', type: String })
  @ApiParam({ name: 'documentId', description: '文档 ID', type: String })
  @ApiResponse({ status: 204, description: '文档删除成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '知识库或文档不存在' })
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

  @Get(':id/documents/:documentId/content')
  @Roles('owner', 'admin', 'creator', 'operator', 'viewer')
  @ApiOperation({ summary: '获取文档内容的预签名访问 URL' })
  @ApiParam({ name: 'id', description: '知识库 ID', type: String })
  @ApiParam({ name: 'documentId', description: '文档 ID', type: String })
  @ApiResponse({ status: 200, description: '文档内容 URL 获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @ApiResponse({ status: 404, description: '文档内容不存在或已被删除' })
  @ApiResponse({ status: 503, description: '存储服务暂不可用' })
  async getDocumentContent(
    @Param('id') knowledgeBaseId: string,
    @Param('documentId') documentId: string,
    @CurrentTenant() tenantId: string,
  ) {
    await this.knowledgeBaseService.findByIdOrThrow(knowledgeBaseId, tenantId);
    const content = await this.documentService.getDocumentContentUrl(
      knowledgeBaseId,
      documentId,
    );
    return { data: content };
  }
}
