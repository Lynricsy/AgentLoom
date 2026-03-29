import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { DocumentService } from '../document.service';
import { KnowledgeBaseController } from '../knowledge-base.controller';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { KnowledgeGateway } from '../knowledge.gateway';
import { RagService } from '../services/rag.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const KB_ID = '00000000-0000-0000-0000-000000000010';
const DOCUMENT_ID = '00000000-0000-0000-0000-000000000020';
const EXPECTED_ROLES = ['owner', 'admin', 'creator', 'operator', 'viewer'];

function getHandler(name: 'getDocumentContent'): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    KnowledgeBaseController.prototype,
    name,
  );

  if (typeof descriptor?.value !== 'function') {
    throw new Error(
      `Handler ${name} is not defined on KnowledgeBaseController`,
    );
  }

  return descriptor.value as object;
}

describe('KnowledgeBaseController - getDocumentContent', () => {
  let controller: KnowledgeBaseController;
  let knowledgeBaseService: {
    findByIdOrThrow: ReturnType<typeof vi.fn>;
  };
  let documentService: {
    getDocumentContentUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    knowledgeBaseService = {
      findByIdOrThrow: vi.fn(),
    };

    documentService = {
      getDocumentContentUrl: vi.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [KnowledgeBaseController],
      providers: [
        { provide: KnowledgeBaseService, useValue: knowledgeBaseService },
        { provide: DocumentService, useValue: documentService },
        {
          provide: KnowledgeGateway,
          useValue: { emitKnowledgeBaseUpdated: vi.fn() },
        },
        {
          provide: RagService,
          useValue: { search: vi.fn() },
        },
      ],
    }).compile();

    controller = module.get<KnowledgeBaseController>(KnowledgeBaseController);
  });

  it('正常返回预签名URL', async () => {
    const contentResult = {
      url: 'https://minio.local/bucket/report.pdf?token=abc',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      expiresIn: 3600,
    };

    knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
    documentService.getDocumentContentUrl.mockResolvedValue(contentResult);

    const result = await controller.getDocumentContent(
      KB_ID,
      DOCUMENT_ID,
      TENANT_ID,
    );

    expect(result).toEqual({ data: contentResult });
    expect(knowledgeBaseService.findByIdOrThrow).toHaveBeenCalledWith(
      KB_ID,
      TENANT_ID,
    );
    expect(documentService.getDocumentContentUrl).toHaveBeenCalledWith(
      KB_ID,
      DOCUMENT_ID,
    );
  });

  it('知识库不存在时返回404', async () => {
    const error = new NotFoundException('知识库不存在');
    knowledgeBaseService.findByIdOrThrow.mockRejectedValue(error);

    await expect(
      controller.getDocumentContent(KB_ID, DOCUMENT_ID, TENANT_ID),
    ).rejects.toThrow(error);

    expect(knowledgeBaseService.findByIdOrThrow).toHaveBeenCalledWith(
      KB_ID,
      TENANT_ID,
    );
    expect(documentService.getDocumentContentUrl).not.toHaveBeenCalled();
  });

  it('文档不存在时返回404', async () => {
    const error = new NotFoundException('文档不存在');
    knowledgeBaseService.findByIdOrThrow.mockResolvedValue({ id: KB_ID });
    documentService.getDocumentContentUrl.mockRejectedValue(error);

    await expect(
      controller.getDocumentContent(KB_ID, DOCUMENT_ID, TENANT_ID),
    ).rejects.toThrow(error);

    expect(knowledgeBaseService.findByIdOrThrow).toHaveBeenCalledWith(
      KB_ID,
      TENANT_ID,
    );
    expect(documentService.getDocumentContentUrl).toHaveBeenCalledWith(
      KB_ID,
      DOCUMENT_ID,
    );
  });

  it('角色权限检查', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, getHandler('getDocumentContent')),
    ).toEqual(EXPECTED_ROLES);
  });
});
