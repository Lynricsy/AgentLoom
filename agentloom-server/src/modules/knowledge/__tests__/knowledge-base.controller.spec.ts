import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeBaseController } from '../knowledge-base.controller';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { DocumentService } from '../document.service';

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
  };
  let documentService: {
    uploadFromRequest: ReturnType<typeof vi.fn>;
    findByKnowledgeBase: ReturnType<typeof vi.fn>;
    deleteByKnowledgeBase: ReturnType<typeof vi.fn>;
    deleteDocument: ReturnType<typeof vi.fn>;
    getDocumentContentUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    knowledgeBaseService = {
      create: vi.fn(),
      findSummariesByTenant: vi.fn(),
      findByIdOrThrow: vi.fn(),
      findSummaryByIdOrThrow: vi.fn(),
      delete: vi.fn(),
    };

    documentService = {
      uploadFromRequest: vi.fn(),
      findByKnowledgeBase: vi.fn(),
      deleteByKnowledgeBase: vi.fn(),
      deleteDocument: vi.fn(),
      getDocumentContentUrl: vi.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [KnowledgeBaseController],
      providers: [
        { provide: KnowledgeBaseService, useValue: knowledgeBaseService },
        { provide: DocumentService, useValue: documentService },
      ],
    }).compile();

    controller = module.get<KnowledgeBaseController>(KnowledgeBaseController);
  });

  describe('create', () => {
    it('应创建知识库并返回 { data } 格式', async () => {
      const dto = {
        name: '测试知识库',
        description: '描述',
        visibility: 'private' as const,
        chunkSize: 1024,
        chunkOverlap: 128,
        embeddingModel: 'text-embedding-3-small' as const,
      };
      const createdKB = {
        id: KB_ID,
        ...dto,
        tenantId: TENANT_ID,
        createdBy: USER_ID,
      };
      knowledgeBaseService.create.mockResolvedValue(createdKB);

      const result = await controller.create(dto, TENANT_ID, USER_ID);

      expect(result).toEqual({ data: createdKB });
      expect(knowledgeBaseService.create).toHaveBeenCalledWith(
        dto,
        TENANT_ID,
        USER_ID,
      );
    });
  });

  describe('findAll', () => {
    it('应返回分页知识库列表 { data, meta }', async () => {
      const query = { page: 1, pageSize: 10 };
      const kbList = [
        {
          id: KB_ID,
          name: '知识库1',
          documentCount: 2,
          chunkCount: 6,
          status: 'ready',
        },
      ];
      knowledgeBaseService.findSummariesByTenant.mockResolvedValue({
        data: kbList,
        total: 1,
      });

      const result = await controller.findAll(query, TENANT_ID);

      expect(result).toEqual({
        data: kbList,
        meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      });
      expect(knowledgeBaseService.findSummariesByTenant).toHaveBeenCalledWith(
        TENANT_ID,
        1,
        10,
      );
    });
  });

  describe('findOne', () => {
    it('应返回知识库详情摘要 { data }', async () => {
      const summary = {
        id: KB_ID,
        name: '知识库1',
        documentCount: 2,
        chunkCount: 6,
        status: 'ready',
      };
      knowledgeBaseService.findSummaryByIdOrThrow.mockResolvedValue(summary);

      const result = await controller.findOne(KB_ID, TENANT_ID);

      expect(result).toEqual({ data: summary });
      expect(knowledgeBaseService.findSummaryByIdOrThrow).toHaveBeenCalledWith(
        KB_ID,
        TENANT_ID,
      );
    });
  });

  describe('uploadDocument', () => {
    it('应验证知识库存在后上传文档', async () => {
      const mockRequest = {} as never;
      const uploadedDoc = {
        id: '00000000-0000-0000-0000-000000000020',
        fileName: 'test.pdf',
      };
      knowledgeBaseService.findByIdOrThrow.mockResolvedValue({
        id: KB_ID,
      });
      documentService.uploadFromRequest.mockResolvedValue(uploadedDoc);

      const result = await controller.uploadDocument(
        KB_ID,
        TENANT_ID,
        USER_ID,
        mockRequest,
      );

      expect(result).toEqual({ data: uploadedDoc });
      expect(knowledgeBaseService.findByIdOrThrow).toHaveBeenCalledWith(
        KB_ID,
        TENANT_ID,
      );
      expect(documentService.uploadFromRequest).toHaveBeenCalledWith(
        mockRequest,
        KB_ID,
        TENANT_ID,
        USER_ID,
      );
    });
  });

  describe('listDocuments', () => {
    it('应验证知识库存在后返回分页文档列表', async () => {
      const query = { page: 1, pageSize: 20, status: undefined };
      const docs = [
        { id: '00000000-0000-0000-0000-000000000020', fileName: 'file.pdf' },
      ];
      knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
      documentService.findByKnowledgeBase.mockResolvedValue({
        data: docs,
        total: 1,
      });

      const result = await controller.listDocuments(KB_ID, query, TENANT_ID);

      expect(result).toEqual({
        data: docs,
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
      expect(knowledgeBaseService.findByIdOrThrow).toHaveBeenCalledWith(
        KB_ID,
        TENANT_ID,
      );
      expect(documentService.findByKnowledgeBase).toHaveBeenCalledWith(
        KB_ID,
        TENANT_ID,
        1,
        20,
        undefined,
      );
    });
  });

  describe('deleteKnowledgeBase', () => {
    it('应先校验知识库再级联删除文档与知识库', async () => {
      knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
      documentService.deleteByKnowledgeBase.mockResolvedValue(2);
      knowledgeBaseService.delete.mockResolvedValue(undefined);

      await expect(
        controller.deleteKnowledgeBase(KB_ID, TENANT_ID),
      ).resolves.toBeUndefined();

      expect(knowledgeBaseService.findByIdOrThrow).toHaveBeenCalledWith(
        KB_ID,
        TENANT_ID,
      );
      expect(documentService.deleteByKnowledgeBase).toHaveBeenCalledWith(
        KB_ID,
        TENANT_ID,
      );
      expect(knowledgeBaseService.delete).toHaveBeenCalledWith(
        KB_ID,
        TENANT_ID,
      );
    });
  });

  describe('deleteDocument', () => {
    it('应先校验知识库再删除指定文档', async () => {
      const documentId = '00000000-0000-0000-0000-000000000020';
      knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
      documentService.deleteDocument.mockResolvedValue(undefined);

      await expect(
        controller.deleteDocument(KB_ID, documentId, TENANT_ID),
      ).resolves.toBeUndefined();

      expect(knowledgeBaseService.findByIdOrThrow).toHaveBeenCalledWith(
        KB_ID,
        TENANT_ID,
      );
      expect(documentService.deleteDocument).toHaveBeenCalledWith(
        KB_ID,
        documentId,
        TENANT_ID,
      );
    });
  });

  describe('getDocumentContent', () => {
    it('应验证知识库存在后返回预签名 URL', async () => {
      const documentId = '00000000-0000-0000-0000-000000000020';
      const contentResult = {
        url: 'https://minio.local/bucket/file.pdf?token=abc',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        expiresIn: 3600,
      };
      knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
      documentService.getDocumentContentUrl.mockResolvedValue(contentResult);

      const result = await controller.getDocumentContent(
        KB_ID,
        documentId,
        TENANT_ID,
      );

      expect(result).toEqual({ data: contentResult });
      expect(knowledgeBaseService.findByIdOrThrow).toHaveBeenCalledWith(
        KB_ID,
        TENANT_ID,
      );
      expect(documentService.getDocumentContentUrl).toHaveBeenCalledWith(
        KB_ID,
        documentId,
      );
    });
  });
});
