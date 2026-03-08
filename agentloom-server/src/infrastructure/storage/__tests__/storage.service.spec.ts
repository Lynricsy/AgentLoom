import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from '../storage.service';
import { MINIO_CLIENT } from '../storage.constants';

const BUCKET_NAME = 'test-bucket';

const mockMinioClient = {
  bucketExists: vi.fn(),
  makeBucket: vi.fn(),
  putObject: vi.fn(),
  getObject: vi.fn(),
  removeObject: vi.fn(),
  removeIncompleteUpload: vi.fn(),
  statObject: vi.fn(),
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
  });

  describe('download', () => {
    it('应正确调用 getObject 并返回可读流', async () => {
      const key = 'tenant/kb/doc/file.pdf';
      const mockStream = { pipe: vi.fn() };
      mockMinioClient.getObject.mockResolvedValue(mockStream);

      const result = await service.download(key);

      expect(mockMinioClient.getObject).toHaveBeenCalledWith(
        BUCKET_NAME,
        key,
      );
      expect(result).toBe(mockStream);
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
      expect(mockMinioClient.statObject).toHaveBeenCalledWith(
        BUCKET_NAME,
        key,
      );
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

      expect(result).toBe(
        'tenants/tenant-123/kb/kb-456/doc-789/report.pdf',
      );
    });
  });
});
