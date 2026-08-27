import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from '../storage.service';
import { MINIO_CLIENT } from '../storage.constants';
import {
  StorageObjectNotFoundException,
  StorageUnavailableException,
} from '../storage.exceptions';

const BUCKET_NAME = 'test-bucket';

const mockMinioClient = {
  bucketExists: vi.fn(),
  makeBucket: vi.fn(),
  putObject: vi.fn(),
  getObject: vi.fn(),
  removeObject: vi.fn(),
  removeIncompleteUpload: vi.fn(),
  statObject: vi.fn(),
  presignedGetObject: vi.fn(),
};

const mockConfigService = {
  get: vi.fn((key: string, defaultValue?: string) => {
    if (key === 'APP_MINIO_BUCKET') return BUCKET_NAME;
    return defaultValue;
  }),
};

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: MINIO_CLIENT, useValue: mockMinioClient },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  describe('onModuleInit', () => {
    it('存储桶已存在时应跳过创建', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);

      await service.onModuleInit();

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith(BUCKET_NAME);
      expect(mockMinioClient.makeBucket).not.toHaveBeenCalled();
    });

    it('存储桶不存在时应自动创建', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);
      mockMinioClient.makeBucket.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith(BUCKET_NAME);
      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith(BUCKET_NAME);
    });
  });

  describe('upload', () => {
    it('应正确调用 putObject 上传文件', async () => {
      const key = 'tenant/kb/doc/file.pdf';
      const buffer = Buffer.from('test content');
      const size = buffer.length;
      const contentType = 'application/pdf';
      mockMinioClient.putObject.mockResolvedValue(undefined);

      await service.upload(key, buffer, size, contentType);

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        BUCKET_NAME,
        key,
        buffer,
        size,
        { 'Content-Type': contentType },
      );
    });

    it('可读流未提供大小时应先解析精确长度再上传', async () => {
      const key = 'tenant/kb/doc/workspace.tar';
      const payload = 'sandbox archive';
      const uploadedChunks: Buffer[] = [];

      mockMinioClient.putObject.mockImplementation(
        async (
          _bucket: string,
          _objectKey: string,
          uploaded: Buffer | Readable,
        ) => {
          if (uploaded instanceof Readable) {
            for await (const chunk of uploaded) {
              uploadedChunks.push(
                Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
              );
            }
          }
        },
      );

      await service.upload(
        key,
        Readable.from([payload]),
        undefined,
        'application/x-tar',
      );

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        BUCKET_NAME,
        key,
        expect.any(Readable),
        Buffer.byteLength(payload),
        { 'Content-Type': 'application/x-tar' },
      );
      expect(Buffer.concat(uploadedChunks).toString()).toBe(payload);
    });
  });

  describe('download', () => {
    it('应正确调用 getObject 并返回可读流', async () => {
      const key = 'tenant/kb/doc/file.pdf';
      const mockStream = { pipe: vi.fn() };
      mockMinioClient.getObject.mockResolvedValue(mockStream);

      const result = await service.download(key);

      expect(mockMinioClient.getObject).toHaveBeenCalledWith(BUCKET_NAME, key);
      expect(result).toBe(mockStream);
    });

    it('对象不存在时应将 NoSuchKey 映射为 404 异常', async () => {
      const key = 'tenants/t1/skills/s1/SKILL.md';
      mockMinioClient.getObject.mockRejectedValue({ code: 'NoSuchKey' });

      await expect(service.download(key)).rejects.toThrow(
        StorageObjectNotFoundException,
      );
    });

    it('MinIO 下载失败时应映射为 503 异常', async () => {
      const key = 'tenants/t1/skills/s1/SKILL.md';
      mockMinioClient.getObject.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.download(key)).rejects.toThrow(
        StorageUnavailableException,
      );
    });
  });

  describe('delete', () => {
    it('应正确调用 removeObject 删除文件', async () => {
      const key = 'tenant/kb/doc/file.pdf';
      mockMinioClient.removeObject.mockResolvedValue(undefined);

      await service.delete(key);

      expect(mockMinioClient.removeObject).toHaveBeenCalledWith(
        BUCKET_NAME,
        key,
      );
    });
  });

  describe('removeIncompleteUpload', () => {
    it('应正确调用 removeIncompleteUpload 清理未完成分片', async () => {
      const key = 'tenants/tenant/kb/doc/file.pdf';
      mockMinioClient.removeIncompleteUpload.mockResolvedValue(undefined);

      await service.removeIncompleteUpload(key);

      expect(mockMinioClient.removeIncompleteUpload).toHaveBeenCalledWith(
        BUCKET_NAME,
        key,
      );
    });
  });

  describe('exists', () => {
    it('文件存在时应返回 true', async () => {
      const key = 'tenant/kb/doc/file.pdf';
      mockMinioClient.statObject.mockResolvedValue({ size: 100 });

      const result = await service.exists(key);

      expect(result).toBe(true);
      expect(mockMinioClient.statObject).toHaveBeenCalledWith(BUCKET_NAME, key);
    });

    it('文件不存在时应返回 false', async () => {
      const key = 'tenant/kb/doc/file.pdf';
      mockMinioClient.statObject.mockRejectedValue(new Error('Not found'));

      const result = await service.exists(key);

      expect(result).toBe(false);
    });
  });

  describe('buildStorageKey', () => {
    it('应返回正确格式的存储路径', () => {
      const result = service.buildStorageKey(
        'tenant-123',
        'kb-456',
        'doc-789',
        'report.pdf',
      );

      expect(result).toBe('tenants/tenant-123/kb/kb-456/doc-789/report.pdf');
    });
  });

  describe('getPresignedUrl', () => {
    it('应使用默认过期时间生成预签名 URL', async () => {
      const key = 'tenants/t1/kb/kb1/doc1/file.pdf';
      const expectedUrl = 'https://minio.local/test-bucket/file.pdf?token=abc';
      mockMinioClient.statObject.mockResolvedValue({ size: 100 });
      mockMinioClient.presignedGetObject.mockResolvedValue(expectedUrl);

      const result = await service.getPresignedUrl(key);

      expect(mockMinioClient.statObject).toHaveBeenCalledWith(BUCKET_NAME, key);
      expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith(
        BUCKET_NAME,
        key,
        3600,
      );
      expect(result).toBe(expectedUrl);
    });

    it('应支持自定义过期时间', async () => {
      const key = 'tenants/t1/kb/kb1/doc1/report.md';
      const expirySeconds = 600;
      const expectedUrl = 'https://minio.local/test-bucket/report.md?token=xyz';
      mockMinioClient.statObject.mockResolvedValue({ size: 100 });
      mockMinioClient.presignedGetObject.mockResolvedValue(expectedUrl);

      const result = await service.getPresignedUrl(key, expirySeconds);

      expect(mockMinioClient.statObject).toHaveBeenCalledWith(BUCKET_NAME, key);
      expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith(
        BUCKET_NAME,
        key,
        expirySeconds,
      );
      expect(result).toBe(expectedUrl);
    });

    it('对象不存在时应抛出 StorageObjectNotFoundException', async () => {
      const key = 'tenants/t1/kb/kb1/doc1/file.pdf';
      mockMinioClient.statObject.mockRejectedValue({ code: 'NoSuchKey' });

      await expect(service.getPresignedUrl(key)).rejects.toThrow(
        StorageObjectNotFoundException,
      );
      expect(mockMinioClient.presignedGetObject).not.toHaveBeenCalled();
    });

    it('MinIO 不可用时应抛出 StorageUnavailableException', async () => {
      const key = 'tenants/t1/kb/kb1/doc1/file.pdf';
      mockMinioClient.statObject.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.getPresignedUrl(key)).rejects.toThrow(
        StorageUnavailableException,
      );
      expect(mockMinioClient.presignedGetObject).not.toHaveBeenCalled();
    });
  });
});
