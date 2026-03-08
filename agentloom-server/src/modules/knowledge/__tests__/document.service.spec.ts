import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentService } from '../document.service';
import { StorageService } from '../../../infrastructure/storage';
import {
  EmptyFileException,
  UnsupportedFileTypeException,
  FileTooLargeException,
} from '../knowledge.exceptions';
import { MAX_FILE_SIZE_BYTES } from '../knowledge.constants';
import { DRIZZLE } from '../../../database/database.module';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
  randomUUID: vi.fn(),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>(
    'node:crypto',
  );
  return { ...actual, randomUUID: mocks.randomUUID };
});

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const KB_ID = '00000000-0000-0000-0000-000000000010';
const DOC_ID = '00000000-0000-0000-0000-000000000020';

function createMultipartFile(
  filename: string,
  content: Buffer,
): Record<string, unknown> {
  return {
    filename,
    mimetype: 'application/octet-stream',
    toBuffer: vi.fn().mockResolvedValue(content),
  };
}

describe('DocumentService', () => {
  let service: DocumentService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let storageService: {
    upload: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    buildStorageKey: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    db = {
      select: vi.fn(),
      insert: vi.fn(),
    };
    mocks.getTenantDb.mockReturnValue(db);
    mocks.randomUUID.mockReturnValue(DOC_ID);

    storageService = {
      upload: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      buildStorageKey: vi.fn().mockImplementation(
        (tenantId: string, kbId: string, docId: string, fileName: string) =>
          `${tenantId}/${kbId}/${docId}/${fileName}`,
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: DRIZZLE, useValue: db },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
  });

  describe('uploadFromRequest', () => {
    it('应成功上传文件并返回不含 storageKey 的文档', async () => {
      const buffer = Buffer.from('PDF content');
      const multipartFile = createMultipartFile('report.pdf', buffer);
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      const dbDocument = {
        id: DOC_ID,
        knowledgeBaseId: KB_ID,
        tenantId: TENANT_ID,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: buffer.length,
        storageKey: `${TENANT_ID}/${KB_ID}/${DOC_ID}/report.pdf`,
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
        `${TENANT_ID}/${KB_ID}/${DOC_ID}/report.pdf`,
        buffer,
        buffer.length,
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
      const largeBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
      const multipartFile = createMultipartFile('large.pdf', largeBuffer);
      const request = { file: vi.fn().mockResolvedValue(multipartFile) };

      await expect(
        service.uploadFromRequest(request as never, KB_ID, TENANT_ID, USER_ID),
      ).rejects.toThrow(FileTooLargeException);
    });

    it('数据库写入失败时应清理 MinIO 文件并重新抛出错误', async () => {
      const buffer = Buffer.from('PDF content');
      const multipartFile = createMultipartFile('report.pdf', buffer);
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
      expect(storageService.delete).toHaveBeenCalledWith(
        `${TENANT_ID}/${KB_ID}/${DOC_ID}/report.pdf`,
      );
    });

    it('MinIO 清理失败时不应阻止错误抛出', async () => {
      const buffer = Buffer.from('PDF content');
      const multipartFile = createMultipartFile('report.pdf', buffer);
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

    it('应支持按状态筛选', async () => {
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
        'ready',
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
