import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeBaseController } from '../knowledge-base.controller';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { DocumentService } from '../document.service';
import { KnowledgeGateway } from '../knowledge.gateway';
import { RagService } from '../services/rag.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const KB_ID = '00000000-0000-0000-0000-000000000010';

describe('KnowledgeBaseController', () => {
  let controller: KnowledgeBaseController;
  let knowledgeBaseService: {
    create: ReturnType<typeof vi.fn>;
    findSummariesByTenant: ReturnType<typeof vi.fn>;
    findByIdOrThrow: ReturnType<typeof vi.fn>;
    findSummaryByIdOrThrow: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    updateSettings: ReturnType<typeof vi.fn>;
  };
  let documentService: {
    uploadFromRequest: ReturnType<typeof vi.fn>;
    findByKnowledgeBase: ReturnType<typeof vi.fn>;
    deleteByKnowledgeBase: ReturnType<typeof vi.fn>;
    deleteDocument: ReturnType<typeof vi.fn>;
    getDocumentContentUrl: ReturnType<typeof vi.fn>;
    rebuildKnowledgeBase: ReturnType<typeof vi.fn>;
  };
  let knowledgeGateway: {
    emitKnowledgeBaseUpdated: ReturnType<typeof vi.fn>;
  };
  let ragService: {
    search: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    knowledgeBaseService = {
      create: vi.fn(),
      findSummariesByTenant: vi.fn(),
      findByIdOrThrow: vi.fn(),
      findSummaryByIdOrThrow: vi.fn(),
      delete: vi.fn(),
      updateSettings: vi.fn(),
    };

    documentService = {
      uploadFromRequest: vi.fn(),
      findByKnowledgeBase: vi.fn(),
      deleteByKnowledgeBase: vi.fn(),
      deleteDocument: vi.fn(),
      getDocumentContentUrl: vi.fn(),
      rebuildKnowledgeBase: vi.fn(),
    };

    knowledgeGateway = {
      emitKnowledgeBaseUpdated: vi.fn(),
    };

    ragService = {
      search: vi.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [KnowledgeBaseController],
      providers: [
        { provide: KnowledgeBaseService, useValue: knowledgeBaseService },
        { provide: DocumentService, useValue: documentService },
        { provide: KnowledgeGateway, useValue: knowledgeGateway },
        { provide: RagService, useValue: ragService },
      ],
    }).compile();

    controller = module.get<KnowledgeBaseController>(KnowledgeBaseController);
  });

  it('create 应返回 { data } 包装格式', async () => {
    const dto = {
      name: '测试知识库',
      description: '描述',
      visibility: 'private' as const,
      embeddingModel: 'text-embedding-3-small' as const,
      embeddingModelConfigId: null,
      chunkingStrategy: {
        type: 'sentence_window' as const,
        windowSize: 3,
      },
      retrievalStrategy: {
        topK: 8,
        similarityThreshold: null,
      },
      rerankingStrategy: {
        type: 'none' as const,
      },
      queryOrchestration: {
        type: 'none' as const,
      },
    };
    const createdKB = {
      id: KB_ID,
      ...dto,
      tenantId: TENANT_ID,
      createdBy: USER_ID,
    };
    knowledgeBaseService.create.mockResolvedValue(createdKB);

    await expect(controller.create(dto, TENANT_ID, USER_ID)).resolves.toEqual({
      data: createdKB,
    });
  });

  it('findAll 应返回分页知识库列表', async () => {
    const query = { page: 1, pageSize: 10 };
    const kbList = [
      {
        id: KB_ID,
        name: '知识库1',
        documentCount: 2,
        nodeCount: 6,
        chunkCount: 6,
        status: 'ready',
      },
    ];
    knowledgeBaseService.findSummariesByTenant.mockResolvedValue({
      data: kbList,
      total: 1,
    });

    await expect(controller.findAll(query, TENANT_ID)).resolves.toEqual({
      data: kbList,
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
  });

  it('findOne 应返回知识库详情摘要', async () => {
    const summary = {
      id: KB_ID,
      name: '知识库1',
      documentCount: 2,
      nodeCount: 6,
      chunkCount: 6,
      status: 'ready',
    };
    knowledgeBaseService.findSummaryByIdOrThrow.mockResolvedValue(summary);

    await expect(controller.findOne(KB_ID, TENANT_ID)).resolves.toEqual({
      data: summary,
    });
  });

  it('updateSettings 应更新设置并广播知识库更新事件', async () => {
    const dto = {
      retrievalStrategy: {
        topK: 12,
        similarityThreshold: 0.5,
      },
    };
    const updated = {
      id: KB_ID,
      retrievalStrategy: dto.retrievalStrategy,
    };
    knowledgeBaseService.updateSettings.mockResolvedValue(updated);

    await expect(
      controller.updateSettings(KB_ID, dto, TENANT_ID),
    ).resolves.toEqual({
      data: updated,
    });
    expect(knowledgeGateway.emitKnowledgeBaseUpdated).toHaveBeenCalledWith(
      TENANT_ID,
      KB_ID,
    );
  });

  it('testSearch 应固定当前知识库 ID 调用 RagService.search', async () => {
    knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
    ragService.search.mockResolvedValue([
      {
        nodeId: 'node-1',
        chunkId: 'node-1',
      },
    ]);

    await expect(
      controller.testSearch(
        KB_ID,
        { query: '如何接入 API？', topK: 5 },
        TENANT_ID,
      ),
    ).resolves.toEqual({
      data: {
        query: '如何接入 API？',
        knowledgeBaseId: KB_ID,
        total: 1,
        results: [{ nodeId: 'node-1', chunkId: 'node-1' }],
      },
    });

    expect(ragService.search).toHaveBeenCalledWith(
      '如何接入 API？',
      TENANT_ID,
      {
        knowledgeBaseIds: [KB_ID],
        limit: 5,
      },
    );
  });

  it('rebuild 应返回重建任务摘要', async () => {
    knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
    documentService.rebuildKnowledgeBase.mockResolvedValue(3);

    await expect(
      controller.rebuild(KB_ID, { force: true }, TENANT_ID),
    ).resolves.toEqual({
      data: {
        knowledgeBaseId: KB_ID,
        documentCount: 3,
      },
    });
  });

  it('uploadDocument 应验证知识库存在后上传文档', async () => {
    const mockRequest = {} as never;
    const uploadedDoc = {
      id: '00000000-0000-0000-0000-000000000020',
      fileName: 'test.pdf',
    };
    knowledgeBaseService.findByIdOrThrow.mockResolvedValue({
      id: KB_ID,
    });
    documentService.uploadFromRequest.mockResolvedValue(uploadedDoc);

    await expect(
      controller.uploadDocument(KB_ID, TENANT_ID, USER_ID, mockRequest),
    ).resolves.toEqual({
      data: uploadedDoc,
    });
  });

  it('listDocuments 应验证知识库存在后返回分页文档列表', async () => {
    const query = { page: 1, pageSize: 20, status: undefined };
    const docs = [
      { id: '00000000-0000-0000-0000-000000000020', fileName: 'file.pdf' },
    ];
    knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
    documentService.findByKnowledgeBase.mockResolvedValue({
      data: docs,
      total: 1,
    });

    await expect(
      controller.listDocuments(KB_ID, query, TENANT_ID),
    ).resolves.toEqual({
      data: docs,
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
  });

  it('deleteKnowledgeBase 应级联删除文档与知识库，并广播事件', async () => {
    knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
    documentService.deleteByKnowledgeBase.mockResolvedValue(2);
    knowledgeBaseService.delete.mockResolvedValue(undefined);

    await expect(
      controller.deleteKnowledgeBase(KB_ID, TENANT_ID),
    ).resolves.toBeUndefined();

    expect(knowledgeGateway.emitKnowledgeBaseUpdated).toHaveBeenCalledWith(
      TENANT_ID,
      KB_ID,
    );
  });

  it('deleteDocument 应先校验知识库再删除指定文档', async () => {
    const documentId = '00000000-0000-0000-0000-000000000020';
    knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
    documentService.deleteDocument.mockResolvedValue(undefined);

    await expect(
      controller.deleteDocument(KB_ID, documentId, TENANT_ID),
    ).resolves.toBeUndefined();
  });

  it('getDocumentContent 应验证知识库存在后返回预签名 URL', async () => {
    const documentId = '00000000-0000-0000-0000-000000000020';
    const contentResult = {
      url: 'https://minio.local/bucket/file.pdf?token=abc',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      expiresIn: 3600,
    };
    knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
    documentService.getDocumentContentUrl.mockResolvedValue(contentResult);

    await expect(
      controller.getDocumentContent(KB_ID, documentId, TENANT_ID),
    ).resolves.toEqual({
      data: contentResult,
    });
  });
});
