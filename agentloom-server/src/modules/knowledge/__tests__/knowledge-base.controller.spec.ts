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
    findAllByTenant: ReturnType<typeof vi.fn>;
    findByIdOrThrow: ReturnType<typeof vi.fn>;
  };
  let documentService: {
    uploadFromRequest: ReturnType<typeof vi.fn>;
    findByKnowledgeBase: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    knowledgeBaseService = {
      create: vi.fn(),
      findAllByTenant: vi.fn(),
      findByIdOrThrow: vi.fn(),
    };

    documentService = {
      uploadFromRequest: vi.fn(),
      findByKnowledgeBase: vi.fn(),
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
      const dto = { name: '测试知识库', description: '描述', visibility: 'private' as const };
      const createdKB = { id: KB_ID, ...dto, tenantId: TENANT_ID, createdBy: USER_ID };
      knowledgeBaseService.create.mockResolvedValue(createdKB);

      const result = await controller.create(dto, TENANT_ID, USER_ID);

      expect(result).toEqual({ data: createdKB });
      expect(knowledgeBaseService.create).toHaveBeenCalledWith(dto, TENANT_ID, USER_ID);
    });
  });

  describe('findAll', () => {
    it('应返回分页知识库列表 { data, meta }', async () => {
      const query = { page: 1, pageSize: 10 };
      const kbList = [{ id: KB_ID, name: '知识库1' }];
      knowledgeBaseService.findAllByTenant.mockResolvedValue({
        data: kbList,
        total: 1,
      });

      const result = await controller.findAll(query, TENANT_ID);

      expect(result).toEqual({
        data: kbList,
        meta: { page: 1, pageSize: 10, total: 1 },
      });
      expect(knowledgeBaseService.findAllByTenant).toHaveBeenCalledWith(
        TENANT_ID,
        1,
        10,
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
      const docs = [{ id: '00000000-0000-0000-0000-000000000020', fileName: 'file.pdf' }];
      knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
      documentService.findByKnowledgeBase.mockResolvedValue({
        data: docs,
        total: 1,
      });

      const result = await controller.listDocuments(
        KB_ID,
        query,
        TENANT_ID,
      );

      expect(result).toEqual({
        data: docs,
        meta: { page: 1, pageSize: 20, total: 1 },
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
});
