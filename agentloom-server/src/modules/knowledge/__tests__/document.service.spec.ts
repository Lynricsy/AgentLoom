import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { MultipartFile } from '@fastify/multipart';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentService } from '../document.service';
import { StorageService } from '../../../infrastructure/storage';
import {
  EmptyFileException,
  UnsupportedFileTypeException,
  FileTooLargeException,
  DocumentNotFoundException,
} from '../knowledge.exceptions';
import { DRIZZLE } from '../../../database/database.module';
import { DOCUMENT_PROCESSING_QUEUE } from '../knowledge.constants';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
  uuidv7: vi.fn(),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

vi.mock('uuid', () => ({
  v7: mocks.uuidv7,
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const KB_ID = '00000000-0000-0000-0000-000000000010';
const DOC_ID = '0195814f-df24-7880-9c1e-0f80bb4d0020';
const STORAGE_KEY = `tenants/${TENANT_ID}/kb/${KB_ID}/${DOC_ID}/report.pdf`;
const PDF_BUFFER = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF',
  'utf-8',
);
const TEXT_BUFFER = Buffer.from('# 知识库文档\n\n这是一段 Markdown 文本。', 'utf-8');

function createMultipartFile(
  filename: string,
  content: Buffer,
): MultipartFile {
  const fileStream = Readable.from([content]) as MultipartFile['file'];
  fileStream.truncated = false;

  return {
    type: 'file',
    fieldname: 'file',
    filename,
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    fields: {},
    file: fileStream,
    toBuffer: vi.fn().mockResolvedValue(content),
  };
}

describe('DocumentService', () => {
  let service: DocumentService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let storageService: {
    upload: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    removeIncompleteUpload: ReturnType<typeof vi.fn>;
    buildStorageKey: ReturnType<typeof vi.fn>;
  };
  let processingQueue: { add: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    mocks.getTenantDb.mockReturnValue(db);
    mocks.uuidv7.mockReturnValue(DOC_ID);

    storageService = {
      upload: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      removeIncompleteUpload: vi.fn().mockResolvedValue(undefined),
      buildStorageKey: vi.fn().mockImplementation(
        (tenantId: string, kbId: string, docId: string, fileName: string) =>
          `tenants/${tenantId}/kb/${kbId}/${docId}/${fileName}`,
      ),
    };

    processingQueue = {
      add: vi.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: DRIZZLE, useValue: db },
        { provide: StorageService, useValue: storageService },
        {
          provide: getQueueToken(DOCUMENT_PROCESSING_QUEUE),
          useValue: processingQueue,
        },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
  });

  describe('uploadFromRequest', () => {
    it('应成功上传文件并返回不含 storageKey 的文档', async () => {
      const multipartFile = createMultipartFile('report.pdf', PDF_BUFFER);
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      const dbDocument = {
        id: DOC_ID,
        knowledgeBaseId: KB_ID,
        tenantId: TENANT_ID,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF_BUFFER.length,
        storageKey: STORAGE_KEY,
        status: 'uploaded',
        uploadedBy: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([dbDocument]),
        }),
      });

      const result = await service.uploadFromRequest(
        request as never,
        KB_ID,
        TENANT_ID,
        USER_ID,
      );

      expect(storageService.upload).toHaveBeenCalledWith(
        STORAGE_KEY,
        PDF_BUFFER,
        PDF_BUFFER.length,
        'application/pdf',
      );
      expect(db.insert).toHaveBeenCalled();
      expect(result).not.toHaveProperty('storageKey');
      expect(result.id).toBe(DOC_ID);
      expect(result.fileName).toBe('report.pdf');
    });

    it('没有文件时应抛出 EmptyFileException', async () => {
      const request = { file: vi.fn().mockResolvedValue(null) };

      await expect(
        service.uploadFromRequest(request as never, KB_ID, TENANT_ID, USER_ID),
      ).rejects.toThrow(EmptyFileException);
    });

    it('不支持的文件类型应抛出 UnsupportedFileTypeException', async () => {
      const multipartFile = createMultipartFile(
        'virus.exe',
        Buffer.from('bad'),
      );
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      await expect(
        service.uploadFromRequest(request as never, KB_ID, TENANT_ID, USER_ID),
      ).rejects.toThrow(UnsupportedFileTypeException);
    });

    it('空文件内容应抛出 EmptyFileException', async () => {
      const multipartFile = createMultipartFile('empty.pdf', Buffer.alloc(0));
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      await expect(
        service.uploadFromRequest(request as never, KB_ID, TENANT_ID, USER_ID),
      ).rejects.toThrow(EmptyFileException);
    });

    it('文件过大应抛出 FileTooLargeException', async () => {
      const multipartFile = createMultipartFile('large.pdf', PDF_BUFFER);
      const tooLargeError = new Error('request file too large');
      Object.defineProperty(tooLargeError, 'code', {
        value: 'FST_REQ_FILE_TOO_LARGE',
      });
      multipartFile.toBuffer = vi.fn().mockRejectedValue(
        tooLargeError,
      );
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      await expect(
        service.uploadFromRequest(request as never, KB_ID, TENANT_ID, USER_ID),
      ).rejects.toThrow(FileTooLargeException);
    });

    it('文本文件应基于文本内容通过校验', async () => {
      const multipartFile = createMultipartFile('notes.md', TEXT_BUFFER);
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      const dbDocument = {
        id: DOC_ID,
        knowledgeBaseId: KB_ID,
        tenantId: TENANT_ID,
        fileName: 'notes.md',
        mimeType: 'text/markdown',
        sizeBytes: TEXT_BUFFER.length,
        storageKey: `tenants/${TENANT_ID}/kb/${KB_ID}/${DOC_ID}/notes.md`,
        status: 'uploaded',
        uploadedBy: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([dbDocument]),
        }),
      });

      storageService.buildStorageKey.mockReturnValueOnce(
        `tenants/${TENANT_ID}/kb/${KB_ID}/${DOC_ID}/notes.md`,
      );

      const result = await service.uploadFromRequest(
        request as never,
        KB_ID,
        TENANT_ID,
        USER_ID,
      );

      expect(result.mimeType).toBe('text/markdown');
      expect(storageService.upload).toHaveBeenCalledWith(
        `tenants/${TENANT_ID}/kb/${KB_ID}/${DOC_ID}/notes.md`,
        TEXT_BUFFER,
        TEXT_BUFFER.length,
        'text/markdown',
      );
    });

    it('扩展名与真实内容不匹配时应拒绝上传', async () => {
      const multipartFile = createMultipartFile('notes.txt', PDF_BUFFER);
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      await expect(
        service.uploadFromRequest(request as never, KB_ID, TENANT_ID, USER_ID),
      ).rejects.toThrow(UnsupportedFileTypeException);
    });

    it('数据库写入失败时应清理 MinIO 文件并重新抛出错误', async () => {
      const multipartFile = createMultipartFile('report.pdf', PDF_BUFFER);
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      const dbError = new Error('数据库连接超时');
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(dbError),
        }),
      });

      await expect(
        service.uploadFromRequest(request as never, KB_ID, TENANT_ID, USER_ID),
      ).rejects.toThrow(dbError);

      expect(storageService.upload).toHaveBeenCalled();
      expect(storageService.exists).toHaveBeenCalledWith(STORAGE_KEY);
      expect(storageService.delete).toHaveBeenCalledWith(
        STORAGE_KEY,
      );
    });

    it('MinIO 清理失败时不应阻止错误抛出', async () => {
      const multipartFile = createMultipartFile('report.pdf', PDF_BUFFER);
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      const dbError = new Error('数据库错误');
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(dbError),
        }),
      });
      storageService.delete.mockRejectedValue(new Error('MinIO 不可达'));

      await expect(
        service.uploadFromRequest(request as never, KB_ID, TENANT_ID, USER_ID),
      ).rejects.toThrow(dbError);
    });

    it('上传阶段失败时应清理未完成的 MinIO 分片', async () => {
      const multipartFile = createMultipartFile('report.pdf', PDF_BUFFER);
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };
      const uploadError = new Error('上传中断');

      storageService.upload.mockRejectedValueOnce(uploadError);
      storageService.exists.mockResolvedValueOnce(false);

      await expect(
        service.uploadFromRequest(request as never, KB_ID, TENANT_ID, USER_ID),
      ).rejects.toThrow(uploadError);

      expect(storageService.removeIncompleteUpload).toHaveBeenCalledWith(
        STORAGE_KEY,
      );
      expect(storageService.delete).not.toHaveBeenCalled();
    });
  });

  describe('findByKnowledgeBase', () => {
    it('应返回分页的文档列表（不含 storageKey）和总数', async () => {
      const docRows = [
        {
          id: DOC_ID,
          knowledgeBaseId: KB_ID,
          tenantId: TENANT_ID,
          fileName: 'file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          status: 'uploaded',
          uploadedBy: USER_ID,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const totalResult = [{ total: 1 }];

      const selectChain1 = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(docRows),
              }),
            }),
          }),
        }),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(totalResult),
        }),
      };

      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      const result = await service.findByKnowledgeBase(
        KB_ID,
        TENANT_ID,
        1,
        10,
      );

      expect(result.data).toEqual(docRows);
      expect(result.total).toBe(1);
      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('应支持按多个状态筛选', async () => {
      const selectChain1 = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 0 }]),
        }),
      };

      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      const result = await service.findByKnowledgeBase(
        KB_ID,
        TENANT_ID,
        1,
        10,
        ['uploaded', 'ready'],
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findById', () => {
    it('应返回包含 storageKey 的完整文档记录', async () => {
      const fullDoc = {
        id: DOC_ID,
        knowledgeBaseId: KB_ID,
        tenantId: TENANT_ID,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageKey: STORAGE_KEY,
        status: 'uploaded',
        errorMessage: null,
        uploadedBy: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([fullDoc]),
          }),
        }),
      });

      const result = await service.findById(DOC_ID);

      expect(result).toEqual(fullDoc);
      expect(result.storageKey).toBe(STORAGE_KEY);
    });

    it('文档不存在时应抛出 DocumentNotFoundException', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.findById('nonexistent-id')).rejects.toThrow(
        DocumentNotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('应更新文档状态', async () => {
      const setFn = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      db.update.mockReturnValue({ set: setFn });

      await service.updateStatus(DOC_ID, 'processing');

      expect(db.update).toHaveBeenCalled();
      expect(setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'processing',
          errorMessage: null,
        }),
      );
    });

    it('应同时更新状态和错误信息', async () => {
      const setFn = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      db.update.mockReturnValue({ set: setFn });

      await service.updateStatus(DOC_ID, 'failed', 'Parse error: corrupt file');

      expect(setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'Parse error: corrupt file',
        }),
      );
    });
  });

  describe('uploadFromRequest (job dispatch)', () => {
    it('上传成功后应派发文档处理任务', async () => {
      const multipartFile = createMultipartFile('report.pdf', PDF_BUFFER);
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      const dbDocument = {
        id: DOC_ID,
        knowledgeBaseId: KB_ID,
        tenantId: TENANT_ID,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF_BUFFER.length,
        storageKey: STORAGE_KEY,
        status: 'uploaded',
        errorMessage: null,
        uploadedBy: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([dbDocument]),
        }),
      });

      await service.uploadFromRequest(request as never, KB_ID, TENANT_ID, USER_ID);

      expect(processingQueue.add).toHaveBeenCalledWith(
        'process',
        { documentId: DOC_ID },
        expect.objectContaining({
          attempts: 3,
          jobId: `process-${DOC_ID}`,
        }),
      );
    });
  });
});
